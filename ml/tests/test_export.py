"""Chaîne d'export ONNX sur des modèles non entraînés (rapide, sans données ni GPU)."""

from pathlib import Path

import numpy as np
import pytest
import torch

from soundguard_ml.export_onnx import PARITY_TOLERANCE, export, parity, parity_inputs, run_onnx
from soundguard_ml.models import ClassifierExport, ConvAutoencoder, SoundClassifier


@pytest.fixture(scope="module")
def inputs():
    rng = np.random.default_rng(0)
    t = np.arange(16_000) / 16_000
    waves = [0.3 * np.sin(2 * np.pi * f * t) for f in (220, 1_000, 5_000)]
    waves.append(0.1 * rng.standard_normal(16_000))
    return np.stack(waves).astype(np.float32)


def _with_stats(module):
    module.frontend.set_normalization(-4.0, 3.0)
    return module


def test_classifier_export_parity(tmp_path, inputs):
    torch.manual_seed(0)
    module = ClassifierExport(_with_stats(SoundClassifier()))
    path = tmp_path / "classifier.onnx"
    export(module, path, ["logits", "probs"])
    diffs = parity(module, path, inputs)
    assert set(diffs) == {"logits", "probs"}
    assert max(diffs.values()) < PARITY_TOLERANCE
    assert path.stat().st_size < 6 * 1024 * 1024


def test_autoencoder_export_parity(tmp_path, inputs):
    torch.manual_seed(0)
    module = _with_stats(ConvAutoencoder())
    path = tmp_path / "autoencoder.onnx"
    export(module, path, ["score", "embedding"])
    diffs = parity(module, path, inputs)
    assert max(diffs.values()) < PARITY_TOLERANCE


def test_exported_batch_is_dynamic(tmp_path, inputs):
    module = ClassifierExport(_with_stats(SoundClassifier()))
    path = tmp_path / "c.onnx"
    export(module, path, ["logits", "probs"])
    assert run_onnx(path, inputs[:1])[0].shape == (1, 50)
    assert run_onnx(path, inputs)[0].shape == (4, 50)


def test_parity_inputs_shape():
    waves, source = parity_inputs(n=4)
    assert waves.shape == (4, 16_000)
    assert source


def test_exported_file_has_no_local_paths(tmp_path):
    module = ClassifierExport(_with_stats(SoundClassifier()))
    path = tmp_path / "c.onnx"
    export(module, path, ["logits", "probs"])
    raw = path.read_bytes()
    assert b"stack_trace" not in raw
    assert b'File "/' not in raw
    assert str(Path.home()).encode() not in raw
