"""Classifieur CNN compact et autoencodeur convolutif, front-end log-mel inclus."""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import nn

from soundguard_ml.augment import spec_augment
from soundguard_ml.frontend import FrontendConfig, LogMelFrontend


def conv_block(c_in: int, c_out: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(c_in, c_out, 3, padding=1, bias=False),
        nn.BatchNorm2d(c_out),
        nn.ReLU(inplace=True),
        nn.Conv2d(c_out, c_out, 3, padding=1, bias=False),
        nn.BatchNorm2d(c_out),
        nn.ReLU(inplace=True),
    )


@dataclass(frozen=True)
class ClassifierConfig:
    n_classes: int = 50
    channels: tuple[int, ...] = (32, 64, 128, 192)
    dropout: float = 0.3
    freq_masks: int = 2
    freq_mask_width: int = 8
    time_masks: int = 2
    time_mask_width: int = 16


class SoundClassifier(nn.Module):
    """Forme d'onde 16 kHz (B, N) → logits (B, n_classes). N quelconque ≥ n_fft."""

    def __init__(self, cfg: ClassifierConfig | None = None, frontend: FrontendConfig | None = None):
        super().__init__()
        self.cfg = cfg or ClassifierConfig()
        self.frontend = LogMelFrontend(frontend)
        blocks: list[nn.Module] = []
        c_in = 1
        for i, c_out in enumerate(self.cfg.channels):
            blocks.append(conv_block(c_in, c_out))
            # Pas de sous-échantillonnage après le dernier bloc.
            if i < len(self.cfg.channels) - 1:
                blocks.append(nn.AvgPool2d(2))
            c_in = c_out
        self.features = nn.Sequential(*blocks)
        self.dropout = nn.Dropout(self.cfg.dropout)
        self.head = nn.Linear(c_in, self.cfg.n_classes)

    def embed(self, waveform: torch.Tensor) -> torch.Tensor:
        x = self.frontend(waveform)
        if self.training:
            x = spec_augment(
                x,
                freq_masks=self.cfg.freq_masks,
                freq_width=self.cfg.freq_mask_width,
                time_masks=self.cfg.time_masks,
                time_width=self.cfg.time_mask_width,
            )
        x = self.features(x)  # (B, C, F', T')
        x = x.mean(dim=2)  # moyenne sur les fréquences
        return x.amax(dim=2) + x.mean(dim=2)  # max + moyenne sur le temps

    def forward(self, waveform: torch.Tensor) -> torch.Tensor:
        return self.head(self.dropout(self.embed(waveform)))


class ClassifierExport(nn.Module):
    """Variante exportée : renvoie logits et probabilités."""

    def __init__(self, model: SoundClassifier) -> None:
        super().__init__()
        self.model = model

    def forward(self, waveform: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        logits = self.model(waveform)
        return logits, torch.softmax(logits, dim=-1)


@dataclass(frozen=True)
class AutoencoderConfig:
    channels: tuple[int, ...] = (16, 32, 64)
    bottleneck: int = 32
    frames: int = 96  # trames utilisées (multiple de 2^len(channels))


class ConvAutoencoder(nn.Module):
    """Forme d'onde 1 s → (score d'anomalie (B,), embedding (B, bottleneck)).

    Le score est l'erreur quadratique moyenne de reconstruction du log-mel normalisé.
    L'embedding (moyenne du goulot) sert à la distance à la ligne de base dans le navigateur.
    """

    def __init__(self, cfg: AutoencoderConfig | None = None, frontend: FrontendConfig | None = None):
        super().__init__()
        self.cfg = cfg or AutoencoderConfig()
        self.frontend = LogMelFrontend(frontend)
        enc: list[nn.Module] = []
        c_in = 1
        for c_out in self.cfg.channels:
            enc += [
                nn.Conv2d(c_in, c_out, 3, stride=2, padding=1, bias=False),
                nn.BatchNorm2d(c_out),
                nn.ReLU(inplace=True),
            ]
            c_in = c_out
        enc.append(nn.Conv2d(c_in, self.cfg.bottleneck, 1))
        self.encoder = nn.Sequential(*enc)
        dec: list[nn.Module] = [nn.Conv2d(self.cfg.bottleneck, c_in, 1), nn.ReLU(inplace=True)]
        for c_out in [*reversed(self.cfg.channels[:-1]), 8]:
            dec += [
                nn.ConvTranspose2d(c_in, c_out, 4, stride=2, padding=1, bias=False),
                nn.BatchNorm2d(c_out),
                nn.ReLU(inplace=True),
            ]
            c_in = c_out
        dec.append(nn.Conv2d(c_in, 1, 3, padding=1))
        self.decoder = nn.Sequential(*dec)

    def features(self, waveform: torch.Tensor) -> torch.Tensor:
        x = self.frontend(waveform)
        return x[..., : self.cfg.frames]

    def reconstruct(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        z = self.encoder(x)
        return self.decoder(z), z

    def forward(self, waveform: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        x = self.features(waveform)
        x_hat, z = self.reconstruct(x)
        score = ((x - x_hat) ** 2).mean(dim=(1, 2, 3))
        embedding = z.mean(dim=(2, 3))
        return score, embedding


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
