"""Front-end log-mel intégré au graphe : STFT par convolution, banc mel, log, normalisation.

Le navigateur n'envoie que la forme d'onde 16 kHz ; tout le prétraitement vit dans le modèle,
ce qui supprime le problème de parité entre un log-mel calculé en JS et celui de l'entraînement.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import torch
from torch import nn

from soundguard_ml import SAMPLE_RATE


@dataclass(frozen=True)
class FrontendConfig:
    sample_rate: int = SAMPLE_RATE
    n_fft: int = 512
    hop_length: int = 160
    n_mels: int = 64
    f_min: float = 50.0
    f_max: float = 8_000.0
    log_eps: float = 1e-6

    @property
    def n_freqs(self) -> int:
        return self.n_fft // 2 + 1

    def n_frames(self, n_samples: int) -> int:
        """Nombre de trames produites (STFT sans remplissage)."""
        return 1 + (n_samples - self.n_fft) // self.hop_length


def hz_to_mel_slaney(hz: np.ndarray) -> np.ndarray:
    """Échelle mel de Slaney (linéaire sous 1 kHz, logarithmique au-dessus), comme librosa."""
    hz = np.asarray(hz, dtype=np.float64)
    f_sp = 200.0 / 3
    mel = hz / f_sp
    min_log_hz = 1_000.0
    min_log_mel = min_log_hz / f_sp
    logstep = math.log(6.4) / 27.0
    return np.where(hz >= min_log_hz, min_log_mel + np.log(np.maximum(hz, 1e-12) / min_log_hz) / logstep, mel)


def mel_to_hz_slaney(mel: np.ndarray) -> np.ndarray:
    mel = np.asarray(mel, dtype=np.float64)
    f_sp = 200.0 / 3
    hz = mel * f_sp
    min_log_hz = 1_000.0
    min_log_mel = min_log_hz / f_sp
    logstep = math.log(6.4) / 27.0
    return np.where(mel >= min_log_mel, min_log_hz * np.exp(logstep * (mel - min_log_mel)), hz)


def mel_filterbank(cfg: FrontendConfig) -> np.ndarray:
    """Filtres triangulaires normalisés en aire (« slaney »), forme (n_mels, n_freqs).

    Reproduit librosa.filters.mel(htk=False, norm="slaney") sans en dépendre.
    """
    fft_freqs = np.linspace(0, cfg.sample_rate / 2, cfg.n_freqs)
    mel_points = np.linspace(
        hz_to_mel_slaney(np.array(cfg.f_min)), hz_to_mel_slaney(np.array(cfg.f_max)), cfg.n_mels + 2
    )
    hz_points = mel_to_hz_slaney(mel_points)
    fdiff = np.diff(hz_points)
    ramps = hz_points[:, None] - fft_freqs[None, :]
    weights = np.zeros((cfg.n_mels, cfg.n_freqs))
    for i in range(cfg.n_mels):
        lower = -ramps[i] / fdiff[i]
        upper = ramps[i + 2] / fdiff[i + 1]
        weights[i] = np.maximum(0, np.minimum(lower, upper))
    enorm = 2.0 / (hz_points[2 : cfg.n_mels + 2] - hz_points[: cfg.n_mels])
    return (weights * enorm[:, None]).astype(np.float32)


def stft_kernels(cfg: FrontendConfig) -> np.ndarray:
    """Noyaux de convolution (2 * n_freqs, 1, n_fft) : parties réelle puis imaginaire, fenêtre de Hann."""
    n = np.arange(cfg.n_fft)
    window = 0.5 - 0.5 * np.cos(2 * np.pi * n / cfg.n_fft)  # Hann périodique (comme librosa)
    k = np.arange(cfg.n_freqs)[:, None]
    phase = 2 * np.pi * k * n[None, :] / cfg.n_fft
    real = np.cos(phase) * window
    imag = -np.sin(phase) * window
    return np.concatenate([real, imag], axis=0)[:, None, :].astype(np.float32)


class LogMelFrontend(nn.Module):
    """Forme d'onde (B, N) → log-mel normalisé (B, 1, n_mels, T)."""

    def __init__(self, cfg: FrontendConfig | None = None) -> None:
        super().__init__()
        self.cfg = cfg or FrontendConfig()
        self.register_buffer("stft_kernel", torch.from_numpy(stft_kernels(self.cfg)))
        self.register_buffer("mel_basis", torch.from_numpy(mel_filterbank(self.cfg)))
        # Statistiques globales de normalisation, fixées sur le jeu d'entraînement.
        self.register_buffer("norm_mean", torch.zeros(()))
        self.register_buffer("norm_std", torch.ones(()))

    def power_spectrogram(self, waveform: torch.Tensor) -> torch.Tensor:
        frames = nn.functional.conv1d(waveform.unsqueeze(1), self.stft_kernel, stride=self.cfg.hop_length)
        real, imag = frames.split(self.cfg.n_freqs, dim=1)
        return real * real + imag * imag  # (B, n_freqs, T)

    def log_mel(self, waveform: torch.Tensor) -> torch.Tensor:
        mel = torch.matmul(self.mel_basis, self.power_spectrogram(waveform))
        return torch.log(mel + self.cfg.log_eps)  # (B, n_mels, T)

    def set_normalization(self, mean: float, std: float) -> None:
        self.norm_mean.fill_(float(mean))
        self.norm_std.fill_(max(float(std), 1e-6))

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        x = (self.log_mel(waveform) - self.norm_mean) / self.norm_std
        return x.unsqueeze(1)
