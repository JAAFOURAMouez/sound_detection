"""Augmentations de données. Fonctions pures (le hasard passe par un générateur explicite)."""

from __future__ import annotations

import numpy as np
import torch


def frame_energy(waveform: np.ndarray, window: int, hop: int) -> np.ndarray:
    """Énergie moyenne de chaque fenêtre de `window` échantillons, tous les `hop`."""
    n = 1 + max(0, len(waveform) - window) // hop
    return np.array([np.mean(waveform[i * hop : i * hop + window] ** 2) for i in range(n)])


def crop_starts_by_energy(waveform: np.ndarray, window: int, hop: int, floor_db: float = -50.0):
    """Débuts de fenêtres candidates et poids de tirage, favorisant les passages sonores.

    Les clips ESC-50 sont souvent complétés par du silence : un recadrage uniforme
    donnerait des exemples muets étiquetés « verre brisé ». Les fenêtres à plus de
    `floor_db` sous la plus forte reçoivent un poids proportionnel à leur énergie.
    """
    energy = frame_energy(waveform, window, hop)
    starts = np.arange(len(energy)) * hop
    if energy.max() <= 0:
        return starts, np.full(len(energy), 1.0 / len(energy))
    threshold = energy.max() * 10 ** (floor_db / 10)
    weights = np.where(energy >= threshold, energy, 0.0)
    return starts, weights / weights.sum()


def random_crop(
    waveform: torch.Tensor,
    starts: np.ndarray,
    weights: np.ndarray,
    length: int,
    rng: np.random.Generator,
    jitter: int = 0,
) -> torch.Tensor:
    """Extrait `length` échantillons à partir d'un début tiré selon `weights` (± jitter)."""
    start = int(rng.choice(starts, p=weights))
    if jitter:
        start += int(rng.integers(-jitter, jitter + 1))
    start = int(np.clip(start, 0, waveform.shape[-1] - length))
    return waveform[..., start : start + length]


def add_noise(waveform: torch.Tensor, snr_db: torch.Tensor, generator: torch.Generator | None = None):
    """Ajoute un bruit blanc gaussien au rapport signal/bruit donné (par exemple, en dB)."""
    signal_power = waveform.pow(2).mean(dim=-1, keepdim=True).clamp_min(1e-10)
    noise_power = signal_power / (10 ** (snr_db.unsqueeze(-1) / 10))
    noise = torch.randn(waveform.shape, generator=generator, device=waveform.device)
    return waveform + noise * noise_power.sqrt()


def mixup(x: torch.Tensor, y: torch.Tensor, alpha: float, generator: torch.Generator | None = None):
    """Mélange deux à deux les exemples et leurs cibles (y en one-hot ou probabilités)."""
    if alpha <= 0:
        return x, y
    lam = torch.distributions.Beta(alpha, alpha).sample((x.shape[0],)).to(x.device)
    lam = torch.maximum(lam, 1 - lam)  # l'exemple d'origine reste majoritaire
    perm = torch.randperm(x.shape[0], generator=generator).to(x.device)
    shape = (-1,) + (1,) * (x.dim() - 1)
    x_mix = lam.view(shape) * x + (1 - lam.view(shape)) * x[perm]
    y_mix = lam.view(-1, 1) * y + (1 - lam.view(-1, 1)) * y[perm]
    return x_mix, y_mix


def _band_mask(size: int, count: int, width: int, batch: int, device: torch.device) -> torch.Tensor:
    """Masque booléen (batch, size) formé de `count` bandes de largeur aléatoire ≤ width."""
    idx = torch.arange(size, device=device)[None, :]
    mask = torch.zeros(batch, size, dtype=torch.bool, device=device)
    for _ in range(count):
        widths = torch.randint(0, width + 1, (batch, 1), device=device)
        starts = (torch.rand(batch, 1, device=device) * (size - widths).clamp_min(1)).long()
        mask |= (idx >= starts) & (idx < starts + widths)
    return mask


def spec_augment(
    spec: torch.Tensor, freq_masks: int, freq_width: int, time_masks: int, time_width: int
) -> torch.Tensor:
    """Masques aléatoires en fréquence et en temps sur (B, 1, F, T) ; valeur de masque = moyenne."""
    b, _, f, t = spec.shape
    fmask = _band_mask(f, freq_masks, freq_width, b, spec.device)[:, None, :, None]
    tmask = _band_mask(t, time_masks, time_width, b, spec.device)[:, None, None, :]
    return spec.masked_fill(fmask | tmask, float(spec.mean()))
