"""Métriques en numpy pur (testées sans dépendance d'entraînement)."""

from __future__ import annotations

import numpy as np


def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> np.ndarray:
    cm = np.zeros((n_classes, n_classes), dtype=np.int64)
    np.add.at(cm, (y_true, y_pred), 1)
    return cm


def accuracy(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(y_true == y_pred))


def macro_f1(y_true: np.ndarray, y_pred: np.ndarray, n_classes: int) -> float:
    cm = confusion_matrix(y_true, y_pred, n_classes)
    tp = np.diag(cm).astype(float)
    precision = np.divide(tp, cm.sum(axis=0), out=np.zeros_like(tp), where=cm.sum(axis=0) > 0)
    recall = np.divide(tp, cm.sum(axis=1), out=np.zeros_like(tp), where=cm.sum(axis=1) > 0)
    denom = precision + recall
    f1 = np.divide(2 * precision * recall, denom, out=np.zeros_like(tp), where=denom > 0)
    present = cm.sum(axis=1) > 0
    return float(f1[present].mean())


def roc_curve(labels: np.ndarray, scores: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Courbe ROC (fpr, tpr) ; label 1 = anomalie, score élevé = plus anormal."""
    order = np.argsort(-scores, kind="mergesort")
    scores, labels = scores[order], labels[order]
    distinct = np.r_[np.flatnonzero(np.diff(scores)), len(scores) - 1]
    tps = np.cumsum(labels)[distinct]
    fps = (distinct + 1) - tps
    tpr = np.r_[0.0, tps / max(1, labels.sum())]
    fpr = np.r_[0.0, fps / max(1, len(labels) - labels.sum())]
    return fpr, tpr


def roc_auc(labels: np.ndarray, scores: np.ndarray) -> float:
    fpr, tpr = roc_curve(np.asarray(labels).astype(int), np.asarray(scores, dtype=float))
    return float(np.trapezoid(tpr, fpr))


def partial_auc(labels: np.ndarray, scores: np.ndarray, max_fpr: float = 0.1) -> float:
    """AUC partielle sur [0, max_fpr], normalisée dans [0, 1] (convention DCASE Task 2)."""
    fpr, tpr = roc_curve(np.asarray(labels).astype(int), np.asarray(scores, dtype=float))
    stop = np.searchsorted(fpr, max_fpr, side="right")
    x = np.r_[fpr[:stop], max_fpr]
    y = np.r_[tpr[:stop], np.interp(max_fpr, fpr, tpr)]
    return float(np.trapezoid(y, x) / max_fpr)
