"""Vérifie les modèles publiés dans frontend/public/models (s'ils existent) :
taille totale sous le budget et parité avec les points de contrôle PyTorch (si présents en local)."""

import json

import numpy as np
import pytest

from soundguard_ml.common import CHECKPOINTS, REPORTS
from soundguard_ml.export_onnx import MODELS_DIR, PARITY_TOLERANCE, SIZE_BUDGET_BYTES, run_onnx

ONNX_FILES = ["classifier.onnx", "autoencoder.onnx"]
pytestmark = pytest.mark.artifacts

published = all((MODELS_DIR / f).exists() for f in ONNX_FILES)


@pytest.mark.skipif(not published, reason="modèles pas encore exportés")
def test_size_budget():
    total = sum((MODELS_DIR / f).stat().st_size for f in ONNX_FILES)
    assert total < SIZE_BUDGET_BYTES


@pytest.mark.skipif(not published, reason="modèles pas encore exportés")
def test_published_models_run_and_match_labels():
    labels = json.loads((MODELS_DIR / "labels.json").read_text())["labels"]
    x = np.zeros((2, 16_000), dtype=np.float32)
    logits, probs = run_onnx(MODELS_DIR / "classifier.onnx", x)
    assert logits.shape == (2, len(labels)) == (2, 50)
    np.testing.assert_allclose(probs.sum(axis=1), 1, atol=1e-5)
    score, embedding = run_onnx(MODELS_DIR / "autoencoder.onnx", x)
    assert score.shape == (2,)
    assert embedding.shape[0] == 2


@pytest.mark.skipif(not published, reason="modèles pas encore exportés")
def test_published_models_contain_no_debug_metadata():
    for name in ONNX_FILES:
        raw = (MODELS_DIR / name).read_bytes()
        assert b"stack_trace" not in raw, name
        assert b"/home/" not in raw, name


@pytest.mark.skipif(not (REPORTS / "export.json").exists(), reason="pas de rapport d'export")
def test_recorded_parity_within_tolerance():
    report = json.loads((REPORTS / "export.json").read_text())
    for name, model in report["models"].items():
        assert max(model["max_abs_diff"].values()) < PARITY_TOLERANCE, name


@pytest.mark.skipif(
    not (
        published and (CHECKPOINTS / "classifier.pt").exists() and (CHECKPOINTS / "autoencoder.pt").exists()
    ),
    reason="points de contrôle PyTorch absents (normal en CI)",
)
def test_trained_checkpoints_match_published_onnx():
    import torch

    from soundguard_ml.export_onnx import parity, parity_inputs
    from soundguard_ml.models import ClassifierExport
    from soundguard_ml.train_autoencoder import build_model as build_ae
    from soundguard_ml.train_classifier import build_model as build_clf

    inputs, _ = parity_inputs()
    clf = torch.load(CHECKPOINTS / "classifier.pt", map_location="cpu", weights_only=False)
    model = build_clf(clf["config"])
    model.load_state_dict(clf["state_dict"])
    assert (
        max(parity(ClassifierExport(model), MODELS_DIR / "classifier.onnx", inputs).values())
        < PARITY_TOLERANCE
    )
    ae = torch.load(CHECKPOINTS / "autoencoder.pt", map_location="cpu", weights_only=False)
    auto = build_ae(ae["config"])
    auto.load_state_dict(ae["state_dict"])
    assert max(parity(auto, MODELS_DIR / "autoencoder.onnx", inputs).values()) < PARITY_TOLERANCE
