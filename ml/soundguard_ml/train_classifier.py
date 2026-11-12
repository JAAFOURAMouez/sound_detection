"""Entraîne le classifieur CNN : validation croisée sur les 5 plis d'ESC-50, puis modèle final.

python -m soundguard_ml.train_classifier --config configs/classifier.yaml
python -m soundguard_ml.train_classifier --folds 1 --epochs 5      # essai rapide
"""

from __future__ import annotations

import argparse
import time
from typing import Any

import numpy as np
import torch
from torch import nn

from soundguard_ml import data as esc
from soundguard_ml.augment import add_noise, mixup
from soundguard_ml.common import (
    CHECKPOINTS,
    REPORTS,
    CropSampler,
    device,
    gather_windows,
    git_revision,
    load_config,
    seed_everything,
    sliding_windows,
    window_samples,
    write_json,
)
from soundguard_ml.metrics import accuracy, confusion_matrix, macro_f1
from soundguard_ml.models import ClassifierConfig, SoundClassifier, count_parameters
from soundguard_ml.report import write_classifier_report


def build_model(cfg: dict[str, Any]) -> SoundClassifier:
    m = cfg["model"]
    return SoundClassifier(ClassifierConfig(channels=tuple(m["channels"]), dropout=m["dropout"]))


@torch.no_grad()
def fit_normalization(
    model: SoundClassifier,
    waves: torch.Tensor,
    sampler: CropSampler,
    rows: np.ndarray,
    rng: np.random.Generator,
) -> None:
    """Moyenne et écart-type globaux du log-mel sur une fenêtre par clip d'entraînement."""
    window = gather_windows(waves, rows, sampler.starts(rows, rng), sampler.window)
    logmel = torch.cat([model.frontend.log_mel(chunk) for chunk in window.split(256)])
    model.frontend.set_normalization(logmel.mean().item(), logmel.std().item())


def train(
    cfg: dict[str, Any], dataset: esc.Esc50, train_rows: np.ndarray, epochs: int, log_prefix: str
) -> SoundClassifier:
    dev = device()
    rng = np.random.default_rng(cfg["seed"])
    seed_everything(cfg["seed"])
    t = cfg["train"]
    window = window_samples(cfg)
    sampler = CropSampler(
        dataset.waveforms[train_rows],
        window,
        cfg["data"]["crop_hop"],
        cfg["data"]["energy_floor_db"],
        cfg["data"]["jitter"],
    )
    waves = torch.as_tensor(np.asarray(dataset.waveforms[train_rows]), device=dev)
    targets = torch.as_tensor(dataset.targets[train_rows], device=dev)

    model = build_model(cfg).to(dev)
    fit_normalization(model, waves, sampler, np.arange(len(train_rows)), rng)
    optimizer = torch.optim.AdamW(model.parameters(), lr=t["lr"], weight_decay=t["weight_decay"])
    total_steps = epochs * t["steps_per_epoch"]
    scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, max_lr=t["lr"], total_steps=total_steps)
    n_classes = model.cfg.n_classes

    model.train()
    start = time.time()
    for epoch in range(epochs):
        running = 0.0
        for _ in range(t["steps_per_epoch"]):
            rows = rng.integers(0, len(train_rows), t["batch_size"])
            x = gather_windows(waves, rows, sampler.starts(rows, rng), window)
            y = nn.functional.one_hot(targets[torch.as_tensor(rows, device=dev)], n_classes).float()
            noisy = torch.as_tensor(rng.random(len(rows)) < t["noise_prob"], device=dev)
            snr = torch.as_tensor(rng.uniform(*t["snr_db"], len(rows)), device=dev, dtype=torch.float32)
            x = torch.where(noisy[:, None], add_noise(x, snr), x)
            if rng.random() < t["mixup_prob"]:
                x, y = mixup(x, y, t["mixup_alpha"])
            loss = -(y * torch.log_softmax(model(x), dim=-1)).sum(dim=-1).mean()
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            scheduler.step()
            running += loss.item()
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(
                f"{log_prefix} époque {epoch + 1:3d}/{epochs}  perte {running / t['steps_per_epoch']:.3f}"
                f"  ({time.time() - start:.0f} s)",
                flush=True,
            )
    return model.eval()


@torch.no_grad()
def evaluate(
    model: SoundClassifier, cfg: dict[str, Any], dataset: esc.Esc50, rows: np.ndarray
) -> dict[str, Any]:
    """Prédiction par clip (moyenne des probabilités des fenêtres sonores) et par fenêtre."""
    dev = next(model.parameters()).device
    window = window_samples(cfg)
    clip_pred, window_true, window_pred = [], [], []
    for r in rows:
        windows = sliding_windows(
            np.asarray(dataset.waveforms[r]),
            window,
            cfg["eval"]["window_hop"],
            cfg["data"]["energy_floor_db"],
        )
        probs = torch.softmax(model(torch.as_tensor(windows, device=dev)), dim=-1).cpu().numpy()
        clip_pred.append(int(probs.mean(axis=0).argmax()))
        window_pred.extend(probs.argmax(axis=1).tolist())
        window_true.extend([int(dataset.targets[r])] * len(windows))
    y_true = dataset.targets[rows]
    y_pred = np.array(clip_pred)
    n = len(dataset.classes)
    return {
        "clip_accuracy": accuracy(y_true, y_pred),
        "clip_macro_f1": macro_f1(y_true, y_pred, n),
        "window_accuracy": accuracy(np.array(window_true), np.array(window_pred)),
        "confusion": confusion_matrix(y_true, y_pred, n),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/classifier.yaml")
    parser.add_argument("--folds", type=int, nargs="*", default=[1, 2, 3, 4, 5])
    parser.add_argument("--epochs", type=int, default=None, help="remplace la valeur de la config")
    parser.add_argument("--skip-final", action="store_true", help="pas de modèle final sur 5 plis")
    parser.add_argument("--skip-cv", action="store_true", help="seulement le modèle final")
    args = parser.parse_args()

    cfg = load_config(args.config)
    epochs = args.epochs or cfg["train"]["epochs"]
    dataset = esc.load()
    print(f"Appareil : {device()} · paramètres : {count_parameters(build_model(cfg)):,}")

    if not args.skip_cv:
        per_fold = []
        confusion = np.zeros((50, 50), dtype=np.int64)
        for test_fold in args.folds:
            train_folds = {f for f in range(1, 6) if f != test_fold}
            model = train(cfg, dataset, dataset.indices(train_folds), epochs, f"[pli {test_fold}]")
            result = evaluate(model, cfg, dataset, dataset.indices({test_fold}))
            confusion += result.pop("confusion")
            per_fold.append({"fold": test_fold, **result})
            print(
                f"[pli {test_fold}] exactitude clip {result['clip_accuracy']:.3f} · F1 macro "
                f"{result['clip_macro_f1']:.3f} · exactitude fenêtre {result['window_accuracy']:.3f}"
            )
            CHECKPOINTS.mkdir(exist_ok=True)
            torch.save(model.state_dict(), CHECKPOINTS / f"classifier_fold{test_fold}.pt")
        summary = {
            "config": cfg,
            "epochs": epochs,
            "git": git_revision(),
            "device": str(device()),
            "parameters": count_parameters(build_model(cfg)),
            "folds": per_fold,
            "mean": {k: float(np.mean([f[k] for f in per_fold])) for k in per_fold[0] if k != "fold"},
            "std": {k: float(np.std([f[k] for f in per_fold])) for k in per_fold[0] if k != "fold"},
            "confusion": confusion.tolist(),
            "classes": dataset.classes,
        }
        write_json(REPORTS / "classifier_cv.json", summary)
        write_classifier_report(summary, REPORTS)
        print(f"Moyenne : {summary['mean']}")

    if not args.skip_final:
        model = train(cfg, dataset, dataset.indices({1, 2, 3, 4, 5}), epochs, "[final]")
        CHECKPOINTS.mkdir(exist_ok=True)
        torch.save(
            {"state_dict": model.state_dict(), "config": cfg, "classes": dataset.classes},
            CHECKPOINTS / "classifier.pt",
        )
        print(f"Modèle final : {CHECKPOINTS / 'classifier.pt'}")


if __name__ == "__main__":
    main()
