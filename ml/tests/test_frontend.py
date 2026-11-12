import numpy as np
import pytest
import torch
from conftest import sine

from soundguard_ml.frontend import (
    FrontendConfig,
    LogMelFrontend,
    hz_to_mel_slaney,
    mel_filterbank,
    mel_to_hz_slaney,
)

CFG = FrontendConfig()


def test_mel_scale_round_trip():
    hz = np.array([0, 50, 500, 1_000, 4_000, 8_000], dtype=float)
    np.testing.assert_allclose(mel_to_hz_slaney(hz_to_mel_slaney(hz)), hz, rtol=1e-9, atol=1e-9)


def test_frame_count_without_padding():
    fe = LogMelFrontend(CFG)
    out = fe(torch.zeros(2, 16_000))
    assert out.shape == (2, 1, CFG.n_mels, CFG.n_frames(16_000)) == (2, 1, 64, 97)


@pytest.mark.parametrize("freq", [300.0, 1_000.0, 3_000.0, 6_000.0])
def test_sine_lights_up_the_matching_mel_band(freq):
    fe = LogMelFrontend(CFG)
    logmel = fe.log_mel(torch.from_numpy(sine(freq))[None])[0].mean(dim=-1).numpy()
    band = int(np.argmax(logmel))
    bank = mel_filterbank(CFG)
    peak_bin = round(freq / (CFG.sample_rate / CFG.n_fft))
    assert bank[band, peak_bin] > 0  # la bande la plus forte contient bien la fréquence


def test_stft_power_matches_numpy_fft():
    x = np.random.default_rng(0).standard_normal(4_000).astype(np.float32)
    fe = LogMelFrontend(CFG)
    power = fe.power_spectrogram(torch.from_numpy(x)[None])[0].numpy()
    n = np.arange(CFG.n_fft)
    window = 0.5 - 0.5 * np.cos(2 * np.pi * n / CFG.n_fft)
    frame = x[CFG.hop_length * 3 : CFG.hop_length * 3 + CFG.n_fft] * window
    expected = np.abs(np.fft.rfft(frame)) ** 2
    np.testing.assert_allclose(power[:, 3], expected, rtol=1e-3, atol=1e-3)


def test_normalization_is_applied():
    fe = LogMelFrontend(CFG)
    x = torch.from_numpy(sine(1_000))[None]
    raw = fe(x)
    fe.set_normalization(mean=raw.mean().item(), std=raw.std().item())
    normed = fe(x)
    assert abs(normed.mean().item()) < 1e-4
    assert abs(normed.std().item() - 1) < 1e-3


def test_matches_librosa_when_available():
    librosa = pytest.importorskip("librosa")
    np.testing.assert_allclose(
        mel_filterbank(CFG),
        librosa.filters.mel(
            sr=CFG.sample_rate, n_fft=CFG.n_fft, n_mels=CFG.n_mels, fmin=CFG.f_min, fmax=CFG.f_max
        ),
        rtol=1e-4,
        atol=1e-6,
    )
    x = np.random.default_rng(1).standard_normal(16_000).astype(np.float32) * 0.1
    ref = librosa.feature.melspectrogram(
        y=x,
        sr=CFG.sample_rate,
        n_fft=CFG.n_fft,
        hop_length=CFG.hop_length,
        n_mels=CFG.n_mels,
        fmin=CFG.f_min,
        fmax=CFG.f_max,
        center=False,
        power=2.0,
    )
    ours = torch.exp(LogMelFrontend(CFG).log_mel(torch.from_numpy(x)[None]))[0].numpy() - CFG.log_eps
    np.testing.assert_allclose(ours, ref, rtol=1e-3, atol=1e-5)
