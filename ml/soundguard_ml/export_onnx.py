"""Exporte les modèles entraînés en ONNX (front-end log-mel inclus) et vérifie la parité.

    python -m soundguard_ml.export_onnx

Sorties dans frontend/public/models : classifier.onnx, autoencoder.onnx, labels.json,
et mise à jour de model-card.json. Rapport de parité et de taille : ml/reports/export.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import onnx
import onnxruntime as ort
import torch
from torch import nn

from soundguard_ml import WINDOW_SAMPLES
from soundguard_ml.common import CHECKPOINTS, ML_ROOT, REPORTS, git_revision, write_json

MODELS_DIR = ML_ROOT.parent / "frontend" / "public" / "models"
OPSET = 18
SIZE_BUDGET_BYTES = 15 * 1024 * 1024
PARITY_TOLERANCE = 1e-3


def export(module: nn.Module, path: Path, output_names: list[str], dynamic_batch: bool = True) -> None:
    """Exporte `module` (entrée : forme d'onde (B, 16000)) en un seul fichier ONNX."""
    module = module.eval().cpu()
    # Lot de 2 : avec un lot de 1, torch.export figerait la dimension (spécialisation 0/1).
    example = (torch.zeros(2, WINDOW_SAMPLES),)
    batch = torch.export.Dim("batch", min=1, max=64) if dynamic_batch else None
    path.parent.mkdir(parents=True, exist_ok=True)
    program = torch.onnx.export(
        module,
        example,
        input_names=["waveform"],
        output_names=output_names,
        dynamic_shapes=({0: batch},) if batch else None,
        opset_version=OPSET,
        dynamo=True,
        external_data=False,
    )
    program.optimize()
    program.save(str(path), external_data=False)
    onnx.checker.check_model(str(path), full_check=True)


def run_onnx(path: Path, waveform: np.ndarray) -> list[np.ndarray]:
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return session.run(None, {"waveform": waveform.astype(np.float32)})


@torch.no_grad()
def parity(module: nn.Module, path: Path, waveform: np.ndarray) -> dict[str, float]:
    """Écart absolu maximal entre PyTorch et ONNX Runtime, sortie par sortie."""
    ours = module.eval().cpu()(torch.from_numpy(waveform.astype(np.float32)))
    ours = ours if isinstance(ours, tuple) else (ours,)
    theirs = run_onnx(path, waveform)
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    names = [o.name for o in session.get_outputs()]
    return {
        name: float(np.max(np.abs(a.numpy() - b))) for name, a, b in zip(names, ours, theirs, strict=True)
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parity_inputs(n: int = 16, seed: int = 0) -> tuple[np.ndarray, str]:
    """Fenêtres réelles d'ESC-50 si le jeu est présent, sinon signaux synthétiques variés."""
    from soundguard_ml import data as esc

    rng = np.random.default_rng(seed)
    if esc.is_available():
        from soundguard_ml.common import sliding_windows

        dataset = esc.load()
        rows = rng.choice(len(dataset.targets), n, replace=False)
        windows = [
            sliding_windows(np.asarray(dataset.waveforms[r]), WINDOW_SAMPLES, 8000, -50)[0] for r in rows
        ]
        return np.stack(windows).astype(np.float32), f"ESC-50 ({n} fenêtres réelles)"
    # Pas de données en local (CI) : signaux de synthèse.
    t = np.arange(WINDOW_SAMPLES) / 16_000
    waves = [0.3 * np.sin(2 * np.pi * f * t) for f in rng.uniform(80, 7_000, n // 2)]
    waves += [0.1 * rng.standard_normal(WINDOW_SAMPLES) for _ in range(n - n // 2)]
    return np.stack(waves).astype(np.float32), f"synthétique ({n} signaux)"


def main() -> None:
    from soundguard_ml.models import ClassifierExport
    from soundguard_ml.train_autoencoder import build_model as build_ae
    from soundguard_ml.train_classifier import build_model as build_classifier

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=MODELS_DIR)
    args = parser.parse_args()

    clf_ckpt = torch.load(CHECKPOINTS / "classifier.pt", map_location="cpu", weights_only=False)
    classifier = build_classifier(clf_ckpt["config"])
    classifier.load_state_dict(clf_ckpt["state_dict"])
    ae_ckpt = torch.load(CHECKPOINTS / "autoencoder.pt", map_location="cpu", weights_only=False)
    autoencoder = build_ae(ae_ckpt["config"])
    autoencoder.load_state_dict(ae_ckpt["state_dict"])

    clf_module = ClassifierExport(classifier)
    clf_path = args.out / "classifier.onnx"
    ae_path = args.out / "autoencoder.onnx"
    export(clf_module, clf_path, ["logits", "probs"])
    export(autoencoder, ae_path, ["score", "embedding"])
    (args.out / "labels.json").write_text(
        json.dumps(
            {"model": "classifier", "dataset": "ESC-50", "labels": clf_ckpt["classes"]},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )

    inputs, source = parity_inputs()
    report: dict[str, Any] = {
        "git": git_revision(),
        "opset": OPSET,
        "parity_inputs": source,
        "tolerance": PARITY_TOLERANCE,
        "models": {},
    }
    for name, module, path in [
        ("classifier", clf_module, clf_path),
        ("autoencoder", autoencoder, ae_path),
    ]:
        diffs = parity(module, path, inputs)
        report["models"][name] = {
            "file": path.name,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "max_abs_diff": diffs,
            "parity_ok": all(d < PARITY_TOLERANCE for d in diffs.values()),
        }
        print(f"{name}: {path.stat().st_size / 1e6:.2f} Mo, écart max {diffs}")
    total = sum(m["bytes"] for m in report["models"].values())
    report["total_bytes"] = total
    report["within_budget"] = total < SIZE_BUDGET_BYTES
    write_json(REPORTS / "export.json", report)
    update_model_card(args.out, report, clf_ckpt["config"], ae_ckpt["config"])
    if not all(m["parity_ok"] for m in report["models"].values()) or not report["within_budget"]:
        raise SystemExit("Parité ou budget de taille non respecté : voir reports/export.json")


def update_model_card(out: Path, report: dict[str, Any], clf_cfg: dict, ae_cfg: dict) -> None:
    card_path = out / "model-card.json"
    card = json.loads(card_path.read_text(encoding="utf-8")) if card_path.exists() else {"models": []}
    card["models"] = [m for m in card["models"] if m["id"] not in {"classifier", "autoencoder"}]
    common = {
        "format": f"ONNX (opset {OPSET}), front-end log-mel inclus dans le graphe",
        "input": "waveform : float32 (batch, 16000), mono 16 kHz, 1 s",
        "license": "Poids entraînés sur ESC-50 (CC BY-NC 3.0) : usage non commercial",
        "training": "ml/ (PyTorch), voir ml/reports",
        "revision": report["git"],
    }
    card["models"] += [
        {
            "id": "classifier",
            "file": "classifier.onnx",
            "role": "Classifieur maison ESC-50 (50 classes)",
            "sizeBytes": report["models"]["classifier"]["bytes"],
            "sha256": report["models"]["classifier"]["sha256"],
            "output": "logits et probs : float32 (batch, 50) ; étiquettes dans labels.json",
            "metrics": "ml/reports/classifier_cv.md",
            "config": clf_cfg,
            **common,
        },
        {
            "id": "autoencoder",
            "file": "autoencoder.onnx",
            "role": "Score d'anomalie générique (erreur de reconstruction) et embedding du goulot",
            "sizeBytes": report["models"]["autoencoder"]["bytes"],
            "sha256": report["models"]["autoencoder"]["sha256"],
            "output": "score : float32 (batch) ; embedding : float32 (batch, 32)",
            "metrics": "ml/reports/autoencoder.md",
            "config": ae_cfg,
            **common,
        },
    ]
    card_path.write_text(json.dumps(card, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
