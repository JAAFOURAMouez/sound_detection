"""Entraîne l'autoencodeur d'anomalies et l'évalue contre des classes tenues à l'écart.

python -m soundguard_ml.train_autoencoder --config configs/autoencoder.yaml
"""

from __future__ import annotations

import argparse
import time
from typing import Any

import numpy as np
import torch

from soundguard_ml import data as esc
from soundguard_ml.augment import add_noise
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
from soundguard_ml.metrics import partial_auc, roc_auc
from soundguard_ml.models import AutoencoderConfig, ConvAutoencoder, count_parameters
from soundguard_ml.report import write_autoencoder_report


def build_model(cfg: dict[str, Any]) -> ConvAutoencoder:
    m = cfg["model"]
    return ConvAutoencoder(AutoencoderConfig(channels=tuple(m["channels"]), bottleneck=m["bottleneck"]))


def anomaly_mask(cfg: dict[str, Any], dataset: esc.Esc50) -> np.ndarray:
    unknown = set(cfg["anomaly_classes"]) - set(dataset.classes)
    if unknown:
        raise ValueError(f"Classes inconnues dans la config : {sorted(unknown)}")
    anomaly_ids = [dataset.classes.index(c) for c in cfg["anomaly_classes"]]
    return np.isin(dataset.targets, anomaly_ids)


def train(
    cfg: dict[str, Any], dataset: esc.Esc50, rows: np.ndarray, epochs: int, prefix: str
) -> ConvAutoencoder:
    dev = device()
    rng = np.random.default_rng(cfg["seed"])
    seed_everything(cfg["seed"])
    t = cfg["train"]
    window = window_samples(cfg)
    sampler = CropSampler(
        dataset.waveforms[rows],
        window,
        cfg["data"]["crop_hop"],
        cfg["data"]["energy_floor_db"],
        cfg["data"]["jitter"],
    )
    waves = torch.as_tensor(np.asarray(dataset.waveforms[rows]), device=dev)
    model = build_model(cfg).to(dev)

    with torch.no_grad():
        idx = np.arange(len(rows))
        logmel = model.frontend.log_mel(gather_windows(waves, idx, sampler.starts(idx, rng), window))
        model.frontend.set_normalization(logmel.mean().item(), logmel.std().item())

    optimizer = torch.optim.AdamW(model.parameters(), lr=t["lr"], weight_decay=t["weight_decay"])
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        optimizer, max_lr=t["lr"], total_steps=epochs * t["steps_per_epoch"]
    )
    model.train()
    start = time.time()
    for epoch in range(epochs):
        running = 0.0
        for _ in range(t["steps_per_epoch"]):
            batch = rng.integers(0, len(rows), t["batch_size"])
            x = gather_windows(waves, batch, sampler.starts(batch, rng), window)
            noisy = torch.as_tensor(rng.random(len(batch)) < t["noise_prob"], device=dev)
            snr = torch.as_tensor(rng.uniform(*t["snr_db"], len(batch)), device=dev, dtype=torch.float32)
            x = torch.where(noisy[:, None], add_noise(x, snr), x)
            loss = model(x)[0].mean()
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            scheduler.step()
            running += loss.item()
        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(
                f"{prefix} époque {epoch + 1:3d}/{epochs}  perte {running / t['steps_per_epoch']:.4f}"
                f"  ({time.time() - start:.0f} s)",
                flush=True,
            )
    return model.eval()


@torch.no_grad()
def window_outputs(model: ConvAutoencoder, cfg: dict[str, Any], dataset: esc.Esc50, rows: np.ndarray):
    """Pour chaque fenêtre sonore de 1 s : erreur de reconstruction, embedding, clip d'origine."""
    dev = next(model.parameters()).device
    window = window_samples(cfg)
    scores, embeddings, window_rows = [], [], []
    for r in rows:
        windows = sliding_windows(
            np.asarray(dataset.waveforms[r]),
            window,
            cfg["eval"]["window_hop"],
            cfg["data"]["energy_floor_db"],
        )
        score, embedding = model(torch.as_tensor(windows, device=dev))
        scores.append(score.cpu().numpy())
        embeddings.append(embedding.cpu().numpy())
        window_rows.extend([r] * len(windows))
    return np.concatenate(scores), np.concatenate(embeddings), np.array(window_rows)


def fit_diagonal_gaussian(embeddings: np.ndarray, eps: float = 1e-3) -> tuple[np.ndarray, np.ndarray]:
    """Ligne de base des embeddings : moyenne et variance (covariance diagonale régularisée)."""
    return embeddings.mean(axis=0), embeddings.var(axis=0) + eps


def embedding_distance(embeddings: np.ndarray, mean: np.ndarray, var: np.ndarray) -> np.ndarray:
    """Distance de Mahalanobis (diagonale) au carré, moyennée par dimension."""
    return np.mean((embeddings - mean) ** 2 / var, axis=1)


def robust_z(values: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """(x − médiane) / MAD de la référence : même normalisation que la calibration du navigateur."""
    median = np.median(reference)
    mad = np.median(np.abs(reference - median)) + 1e-9
    return (values - median) / mad


def clip_max(window_scores: np.ndarray, window_rows: np.ndarray, rows: np.ndarray) -> np.ndarray:
    return np.array([window_scores[window_rows == r].max() for r in rows])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/autoencoder.yaml")
    parser.add_argument("--folds", type=int, nargs="*", default=[1, 2, 3, 4, 5])
    parser.add_argument("--epochs", type=int, default=None)
    parser.add_argument("--skip-final", action="store_true")
    parser.add_argument("--skip-cv", action="store_true")
    parser.add_argument("--report-name", default="autoencoder", help="nom des fichiers de rapport")
    args = parser.parse_args()

    cfg = load_config(args.config)
    epochs = args.epochs or cfg["train"]["epochs"]
    dataset = esc.load()
    is_anomaly = anomaly_mask(cfg, dataset)
    max_fpr = cfg["eval"]["max_fpr"]
    print(
        f"Appareil : {device()} · paramètres : {count_parameters(build_model(cfg)):,} · "
        f"{int(is_anomaly.sum())} clips anomalies / {len(is_anomaly)}"
    )

    if not args.skip_cv:
        per_fold = []
        all_scores, all_dist, all_comb, all_rows = [], [], [], []
        for test_fold in args.folds:
            train_folds = {f for f in range(1, 6) if f != test_fold}
            train_rows = np.array([r for r in dataset.indices(train_folds) if not is_anomaly[r]])
            model = train(cfg, dataset, train_rows, epochs, f"[pli {test_fold}]")
            test_rows = dataset.indices({test_fold})
            train_rec, train_emb, _ = window_outputs(model, cfg, dataset, train_rows)
            mean, var = fit_diagonal_gaussian(train_emb)
            train_dist = embedding_distance(train_emb, mean, var)
            rec, emb, window_rows = window_outputs(model, cfg, dataset, test_rows)
            dist = embedding_distance(emb, mean, var)
            combined = robust_z(rec, train_rec) + robust_z(dist, train_dist)
            labels = is_anomaly[test_rows].astype(int)
            window_labels = is_anomaly[window_rows].astype(int)
            clip_scores = clip_max(rec, window_rows, test_rows)
            clip_dist = clip_max(dist, window_rows, test_rows)
            clip_comb = clip_max(combined, window_rows, test_rows)
            result = {
                "fold": test_fold,
                "clip_auc": roc_auc(labels, clip_scores),
                "clip_pauc": partial_auc(labels, clip_scores, max_fpr),
                "window_auc": roc_auc(window_labels, rec),
                "emb_clip_auc": roc_auc(labels, clip_dist),
                "emb_clip_pauc": partial_auc(labels, clip_dist, max_fpr),
                "emb_window_auc": roc_auc(window_labels, dist),
                "comb_clip_auc": roc_auc(labels, clip_comb),
                "comb_clip_pauc": partial_auc(labels, clip_comb, max_fpr),
                "comb_window_auc": roc_auc(window_labels, combined),
            }
            per_fold.append(result)
            all_scores.append(clip_scores)
            all_dist.append(clip_dist)
            all_comb.append(clip_comb)
            all_rows.append(test_rows)
            print(
                f"[pli {test_fold}] reconstruction : AUC clip {result['clip_auc']:.3f} · pAUC "
                f"{result['clip_pauc']:.3f} · AUC fenêtre {result['window_auc']:.3f} | embedding : AUC clip "
                f"{result['emb_clip_auc']:.3f} | combiné : AUC clip {result['comb_clip_auc']:.3f}"
            )
            CHECKPOINTS.mkdir(exist_ok=True)
            torch.save(model.state_dict(), CHECKPOINTS / f"autoencoder_fold{test_fold}.pt")

        scores = np.concatenate(all_scores)
        dists = np.concatenate(all_dist)
        combs = np.concatenate(all_comb)
        rows = np.concatenate(all_rows)
        normal = ~is_anomaly[rows]
        per_class: dict[str, dict[str, float]] = {}
        for name in cfg["anomaly_classes"]:
            this = dataset.targets[rows] == dataset.classes.index(name)
            keep = normal | this
            per_class[name] = {
                "reconstruction": roc_auc(this[keep].astype(int), scores[keep]),
                "embedding": roc_auc(this[keep].astype(int), dists[keep]),
                "combined": roc_auc(this[keep].astype(int), combs[keep]),
            }
        keys = [k for k in per_fold[0] if k != "fold"]
        summary = {
            "config": cfg,
            "epochs": epochs,
            "git": git_revision(),
            "device": str(device()),
            "parameters": count_parameters(build_model(cfg)),
            "anomaly_classes": cfg["anomaly_classes"],
            "folds": per_fold,
            "mean": {k: float(np.mean([f[k] for f in per_fold])) for k in keys},
            "std": {k: float(np.std([f[k] for f in per_fold])) for k in keys},
            "per_class_auc": per_class,
        }
        write_json(REPORTS / f"{args.report_name}.json", summary)
        write_autoencoder_report(summary, REPORTS, args.report_name)
        print(f"Moyenne : {summary['mean']}")

    if not args.skip_final:
        normal_rows = np.flatnonzero(~is_anomaly)
        model = train(cfg, dataset, normal_rows, epochs, "[final]")
        CHECKPOINTS.mkdir(exist_ok=True)
        torch.save({"state_dict": model.state_dict(), "config": cfg}, CHECKPOINTS / "autoencoder.pt")
        print(f"Modèle final : {CHECKPOINTS / 'autoencoder.pt'}")


if __name__ == "__main__":
    main()
