import numpy as np
import torch

from soundguard_ml.augment import add_noise, crop_starts_by_energy, mixup, random_crop, spec_augment


def test_crops_avoid_silent_padding(rng):
    clip = np.zeros(80_000, dtype=np.float32)
    clip[40_000:48_000] = rng.standard_normal(8_000).astype(np.float32)  # son de 0,5 s à 2,5 s
    starts, weights = crop_starts_by_energy(clip, window=16_000, hop=1_600)
    picked = [int(rng.choice(starts, p=weights)) for _ in range(200)]
    # Toute fenêtre tirée chevauche le son.
    assert all(s + 16_000 > 40_000 and s < 48_000 for s in picked)


def test_silent_clip_falls_back_to_uniform():
    starts, weights = crop_starts_by_energy(np.zeros(80_000, np.float32), 16_000, 1_600)
    np.testing.assert_allclose(weights, 1 / len(starts))


def test_random_crop_length_and_bounds(rng):
    wave = torch.arange(80_000, dtype=torch.float32)
    starts, weights = np.array([0, 64_000]), np.array([0.0, 1.0])
    crop = random_crop(wave, starts, weights, 16_000, rng, jitter=5_000)
    assert crop.shape == (16_000,)
    assert crop[-1].item() == 79_999  # borné à la fin du clip


def test_noise_respects_snr():
    torch.manual_seed(0)
    x = torch.sin(torch.linspace(0, 400, 16_000)).repeat(4, 1)
    noisy = add_noise(x, torch.full((4,), 20.0))
    noise = noisy - x
    snr = 10 * torch.log10(x.pow(2).mean() / noise.pow(2).mean())
    assert abs(snr.item() - 20) < 0.5


def test_mixup_keeps_targets_normalized():
    torch.manual_seed(0)
    x = torch.randn(8, 100)
    y = torch.nn.functional.one_hot(torch.arange(8) % 4, 4).float()
    xm, ym = mixup(x, y, alpha=0.4)
    assert xm.shape == x.shape
    torch.testing.assert_close(ym.sum(dim=1), torch.ones(8))
    assert torch.all(ym.max(dim=1).values >= 0.5)


def test_spec_augment_masks_bands_with_mean():
    torch.manual_seed(0)
    spec = torch.randn(4, 1, 64, 97)
    out = spec_augment(spec, freq_masks=2, freq_width=8, time_masks=2, time_width=16)
    assert out.shape == spec.shape
    changed = (out != spec).float().mean().item()
    assert 0 < changed < 0.6
