"""Fixe des entrées communes et les sorties attendues pour le test de parité ONNX Runtime Web.

Entrées : fenêtres de 1 s à 16 kHz tirées des sons de démonstration (licences libres),
décodées par ffmpeg (nécessaire seulement pour régénérer les fichiers).
Sorties : ONNX Runtime (Python) et, si les points de contrôle sont présents, PyTorch.

    python -m soundguard_ml.parity_fixture

Écrit frontend/src/inference/__fixtures__/parity-inputs.f32 et parity-expected.json ;
le test frontend/src/inference/ortParity.test.ts compare ONNX Runtime Web à ces valeurs.
"""

from __future__ import annotations

import json

import numpy as np

from soundguard_ml import SAMPLE_RATE, WINDOW_SAMPLES
from soundguard_ml.common import CHECKPOINTS, ML_ROOT
from soundguard_ml.export_onnx import MODELS_DIR, run_onnx

FRONTEND = ML_ROOT.parent / "frontend"
FIXTURES = FRONTEND / "src" / "inference" / "__fixtures__"
# (fichier, début de la fenêtre en secondes)
WINDOWS = [
    ("glass-breaking.ogg", 0.95),
    ("alarm-siren.ogg", 2.0),
    ("impact-thud.ogg", 0.9),
    ("ambience-quiet-room.ogg", 30.0),
]


def load_window(name: str, start: float) -> np.ndarray:
    """Décode avec ffmpeg (libsndfile ne lit pas toujours l'Opus) en mono 16 kHz."""
    import subprocess

    raw = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(FRONTEND / "public" / "samples" / name),
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "f32le",
            "-",
        ],
        check=True,
        capture_output=True,
    ).stdout
    y = np.frombuffer(raw, dtype="<f4")
    i = int(start * SAMPLE_RATE)
    return np.asarray(y[i : i + WINDOW_SAMPLES], dtype=np.float32)


def main() -> None:
    inputs = np.stack([load_window(name, start) for name, start in WINDOWS])
    FIXTURES.mkdir(parents=True, exist_ok=True)
    inputs.astype("<f4").tofile(FIXTURES / "parity-inputs.f32")

    logits, probs = run_onnx(MODELS_DIR / "classifier.onnx", inputs)
    score, embedding = run_onnx(MODELS_DIR / "autoencoder.onnx", inputs)
    expected: dict = {
        "windows": [f"{name}@{start}s" for name, start in WINDOWS],
        "shape": list(inputs.shape),
        "onnxruntime_python": {
            "classifier": {"logits": logits.tolist(), "probs": probs.tolist()},
            "autoencoder": {"score": score.tolist(), "embedding": embedding.tolist()},
        },
    }
    if (CHECKPOINTS / "classifier.pt").exists() and (CHECKPOINTS / "autoencoder.pt").exists():
        import torch

        from soundguard_ml.models import ClassifierExport
        from soundguard_ml.train_autoencoder import build_model as build_ae
        from soundguard_ml.train_classifier import build_model as build_clf

        clf_ckpt = torch.load(CHECKPOINTS / "classifier.pt", map_location="cpu", weights_only=False)
        clf = build_clf(clf_ckpt["config"])
        clf.load_state_dict(clf_ckpt["state_dict"])
        ae_ckpt = torch.load(CHECKPOINTS / "autoencoder.pt", map_location="cpu", weights_only=False)
        ae = build_ae(ae_ckpt["config"])
        ae.load_state_dict(ae_ckpt["state_dict"])
        with torch.no_grad():
            x = torch.from_numpy(inputs)
            t_logits, t_probs = ClassifierExport(clf.eval())(x)
            t_score, t_embedding = ae.eval()(x)
        expected["pytorch"] = {
            "classifier": {"logits": t_logits.tolist(), "probs": t_probs.tolist()},
            "autoencoder": {"score": t_score.tolist(), "embedding": t_embedding.tolist()},
        }
    (FIXTURES / "parity-expected.json").write_text(json.dumps(expected) + "\n", encoding="utf-8")
    print(f"{len(WINDOWS)} fenêtres → {FIXTURES}")


if __name__ == "__main__":
    main()
