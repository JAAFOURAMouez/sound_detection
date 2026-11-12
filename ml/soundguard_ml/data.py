"""Jeu ESC-50 : téléchargement vérifié, cache 16 kHz mono, plis officiels.

ESC-50 (K. J. Piczak, 2015) est distribué sous licence CC BY-NC 3.0 : les modèles entraînés
dessus sont réservés à un usage non commercial. Les cinq plis officiels ne sont jamais mélangés.
"""

from __future__ import annotations

import csv
import hashlib
import io
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from soundguard_ml import SAMPLE_RATE

ESC50_URL = "https://github.com/karolpiczak/ESC-50/archive/refs/heads/master.zip"
CLIP_SECONDS = 5
CLIP_SAMPLES = CLIP_SECONDS * SAMPLE_RATE
DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "data"


@dataclass(frozen=True)
class Esc50:
    waveforms: np.ndarray  # (2000, 80000) float32, 16 kHz mono
    targets: np.ndarray  # (2000,) int
    folds: np.ndarray  # (2000,) int, de 1 à 5
    filenames: list[str]
    classes: list[str]  # nom de la classe d'indice i

    def indices(self, folds: set[int]) -> np.ndarray:
        return np.flatnonzero(np.isin(self.folds, sorted(folds)))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def download(root: Path = DEFAULT_ROOT) -> Path:
    """Télécharge l'archive ESC-50 (≈ 600 Mo) si absente et l'extrait. Renvoie le dossier."""
    root.mkdir(parents=True, exist_ok=True)
    target = root / "ESC-50-master"
    if (target / "meta" / "esc50.csv").exists():
        return target
    archive = root / "esc50.zip"
    if not archive.exists():
        print(f"Téléchargement d'ESC-50 depuis {ESC50_URL}…")
        tmp = archive.with_suffix(".part")
        urllib.request.urlretrieve(ESC50_URL, tmp)
        tmp.rename(archive)
    print(f"Archive : {archive} (sha256 {_sha256(archive)})")
    with zipfile.ZipFile(archive) as z:
        z.extractall(root)
    return target


def is_available(root: Path = DEFAULT_ROOT) -> bool:
    """Vrai si le jeu est déjà téléchargé et mis en cache (aucun téléchargement déclenché)."""
    return (root / "ESC-50-master" / "meta" / "esc50.csv").exists() and (root / "esc50_16k.npy").exists()


def read_meta(dataset_dir: Path) -> list[dict[str, str]]:
    text = (dataset_dir / "meta" / "esc50.csv").read_text(encoding="utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def load(root: Path = DEFAULT_ROOT) -> Esc50:
    """Charge ESC-50 rééchantillonné à 16 kHz, en construisant le cache au premier appel."""
    dataset_dir = download(root)
    meta = read_meta(dataset_dir)
    cache = root / "esc50_16k.npy"
    if not cache.exists():
        import librosa  # dépendance d'entraînement uniquement

        print("Rééchantillonnage à 16 kHz (une seule fois)…")
        out = np.zeros((len(meta), CLIP_SAMPLES), dtype=np.float32)
        for i, row in enumerate(meta):
            y, _ = librosa.load(dataset_dir / "audio" / row["filename"], sr=SAMPLE_RATE, mono=True)
            n = min(len(y), CLIP_SAMPLES)
            out[i, :n] = y[:n]
        np.save(cache, out)
    waveforms = np.load(cache, mmap_mode="r")
    targets = np.array([int(r["target"]) for r in meta])
    classes = [""] * 50
    for r in meta:
        classes[int(r["target"])] = r["category"]
    return Esc50(
        waveforms=waveforms,
        targets=targets,
        folds=np.array([int(r["fold"]) for r in meta]),
        filenames=[r["filename"] for r in meta],
        classes=classes,
    )


def cross_validation_splits(n_folds: int = 5):
    """Plis officiels : (pli de test, plis d'entraînement)."""
    for test in range(1, n_folds + 1):
        yield test, {f for f in range(1, n_folds + 1) if f != test}
