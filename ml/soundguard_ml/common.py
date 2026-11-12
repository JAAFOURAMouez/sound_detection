"""Outils partagés par les scripts d'entraînement : configuration, graine, échantillonnage."""

from __future__ import annotations

import json
import random
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import torch
import yaml

from soundguard_ml import SAMPLE_RATE
from soundguard_ml.augment import crop_starts_by_energy, frame_energy

ML_ROOT = Path(__file__).resolve().parents[1]
REPORTS = ML_ROOT / "reports"
CHECKPOINTS = ML_ROOT / "checkpoints"


def load_config(path: str | Path) -> dict[str, Any]:
    with Path(path).open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)  # noqa: NPY002 (graine globale pour les bibliothèques tierces)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def git_revision() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=ML_ROOT, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "inconnu"


class CropSampler:
    """Tire des fenêtres de 1 s dans les clips, en privilégiant les passages sonores."""

    def __init__(self, waveforms: np.ndarray, window: int, hop: int, floor_db: float, jitter: int):
        self.window = window
        self.jitter = jitter
        self.length = waveforms.shape[1]
        self.tables = [crop_starts_by_energy(np.asarray(w), window, hop, floor_db) for w in waveforms]

    def starts(self, rows: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        out = np.empty(len(rows), dtype=np.int64)
        for i, r in enumerate(rows):
            starts, weights = self.tables[r]
            s = int(rng.choice(starts, p=weights)) + int(rng.integers(-self.jitter, self.jitter + 1))
            out[i] = np.clip(s, 0, self.length - self.window)
        return out


def gather_windows(waves: torch.Tensor, rows: np.ndarray, starts: np.ndarray, window: int) -> torch.Tensor:
    """Extrait en une fois les fenêtres (B, window) d'un tenseur de clips déjà sur le GPU."""
    rows_t = torch.as_tensor(rows, device=waves.device)
    idx = torch.as_tensor(starts, device=waves.device)[:, None] + torch.arange(window, device=waves.device)
    return waves[rows_t[:, None], idx]


def sliding_windows(clip: np.ndarray, window: int, hop: int, floor_db: float) -> np.ndarray:
    """Fenêtres d'évaluation sonores d'un clip (au moins une : la plus forte)."""
    energy = frame_energy(clip, window, hop)
    keep = energy >= energy.max() * 10 ** (floor_db / 10) if energy.max() > 0 else np.ones_like(energy, bool)
    starts = np.flatnonzero(keep) * hop
    return np.stack([clip[s : s + window] for s in starts])


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def window_samples(cfg: dict[str, Any]) -> int:
    return int(cfg["data"]["window_seconds"] * SAMPLE_RATE)
