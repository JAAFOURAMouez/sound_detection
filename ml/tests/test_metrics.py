import numpy as np
import pytest

from soundguard_ml.metrics import accuracy, confusion_matrix, macro_f1, partial_auc, roc_auc


def test_confusion_and_accuracy():
    y_true = np.array([0, 0, 1, 2])
    y_pred = np.array([0, 1, 1, 2])
    assert confusion_matrix(y_true, y_pred, 3).tolist() == [[1, 1, 0], [0, 1, 0], [0, 0, 1]]
    assert accuracy(y_true, y_pred) == 0.75


def test_macro_f1_known_value():
    y_true = np.array([0, 0, 1, 2])
    y_pred = np.array([0, 1, 1, 2])
    # F1 : classe 0 = 2/3, classe 1 = 2/3, classe 2 = 1 → moyenne 7/9.
    assert macro_f1(y_true, y_pred, 3) == pytest.approx(7 / 9)


def test_auc_extremes_and_ties():
    labels = np.array([0, 0, 1, 1])
    assert roc_auc(labels, np.array([0.1, 0.2, 0.8, 0.9])) == pytest.approx(1.0)
    assert roc_auc(labels, np.array([0.9, 0.8, 0.2, 0.1])) == pytest.approx(0.0)
    assert roc_auc(labels, np.array([0.5, 0.5, 0.5, 0.5])) == pytest.approx(0.5)


def test_auc_matches_sklearn_when_available(rng):
    sk = pytest.importorskip("sklearn.metrics")
    labels = rng.integers(0, 2, 500)
    scores = rng.standard_normal(500) + labels
    assert roc_auc(labels, scores) == pytest.approx(sk.roc_auc_score(labels, scores))
    # sklearn applique la correction de McClish à la pAUC ; on compare donc à la définition brute.
    fpr, tpr, _ = sk.roc_curve(labels, scores)
    stop = np.searchsorted(fpr, 0.1, side="right")
    x = np.r_[fpr[:stop], 0.1]
    y = np.r_[tpr[:stop], np.interp(0.1, fpr, tpr)]
    assert partial_auc(labels, scores, 0.1) == pytest.approx(np.trapezoid(y, x) / 0.1)


def test_partial_auc_perfect_and_random():
    labels = np.array([0] * 50 + [1] * 50)
    assert partial_auc(labels, np.r_[np.zeros(50), np.ones(50)]) == pytest.approx(1.0)
    assert partial_auc(labels, np.r_[np.ones(50), np.zeros(50)]) == pytest.approx(0.0)
