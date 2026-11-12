"""Rapports lisibles (Markdown + figures) à partir des résultats JSON."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np


def _pct(x: float) -> str:
    return f"{100 * x:.1f} %"


def plot_confusion(confusion: np.ndarray, classes: list[str], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    norm = confusion / np.maximum(confusion.sum(axis=1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(13, 12))
    ax.imshow(norm, cmap="magma", vmin=0, vmax=1)
    ax.set_xticks(range(len(classes)), classes, rotation=90, fontsize=7)
    ax.set_yticks(range(len(classes)), classes, fontsize=7)
    ax.set_xlabel("classe prédite")
    ax.set_ylabel("classe réelle")
    ax.set_title("ESC-50 — matrice de confusion (5 plis cumulés, normalisée par ligne)")
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)


def top_confusions(confusion: np.ndarray, classes: list[str], k: int = 10) -> list[tuple[str, str, int]]:
    off = confusion.copy()
    np.fill_diagonal(off, 0)
    flat = np.argsort(off, axis=None)[::-1][:k]
    return [
        (classes[i], classes[j], int(off[i, j]))
        for i, j in zip(*np.unravel_index(flat, off.shape), strict=True)
    ]


def write_classifier_report(summary: dict[str, Any], reports: Path) -> None:
    confusion = np.array(summary["confusion"])
    classes = summary["classes"]
    plot_confusion(confusion, classes, reports / "classifier_confusion.png")
    per_class = np.diag(confusion) / np.maximum(confusion.sum(axis=1), 1)
    worst = np.argsort(per_class)[:8]
    lines = [
        "# Classifieur CNN — validation croisée ESC-50",
        "",
        f"Révision `{summary['git']}` · {summary['epochs']} époques · {summary['parameters']:,} paramètres"
        f" · appareil `{summary['device']}`.",
        "",
        "Protocole : 5 plis officiels d'ESC-50, jamais mélangés ; chaque pli sert une fois de test.",
        "Entrée du modèle : fenêtres de 1 s à 16 kHz. Prédiction par clip = moyenne des probabilités",
        "des fenêtres sonores (pas de 0,5 s). L'exactitude « par fenêtre » est celle d'une fenêtre",
        "isolée, comme dans le navigateur.",
        "",
        "| Pli | Exactitude (clip) | F1 macro (clip) | Exactitude (fenêtre 1 s) |",
        "|---|---|---|---|",
    ]
    for f in summary["folds"]:
        lines.append(
            f"| {f['fold']} | {_pct(f['clip_accuracy'])} | {_pct(f['clip_macro_f1'])} "
            f"| {_pct(f['window_accuracy'])} |"
        )
    m, s = summary["mean"], summary["std"]
    lines += [
        f"| **moyenne ± écart-type** | **{_pct(m['clip_accuracy'])} ± {_pct(s['clip_accuracy'])}** "
        f"| **{_pct(m['clip_macro_f1'])} ± {_pct(s['clip_macro_f1'])}** "
        f"| **{_pct(m['window_accuracy'])} ± {_pct(s['window_accuracy'])}** |",
        "",
        "![Matrice de confusion](classifier_confusion.png)",
        "",
        "## Classes les plus difficiles (exactitude par clip, 5 plis)",
        "",
        "| Classe | Exactitude |",
        "|---|---|",
        *[f"| {classes[i]} | {_pct(per_class[i])} |" for i in worst],
        "",
        "## Confusions les plus fréquentes",
        "",
        "| Réelle | Prédite | Clips |",
        "|---|---|---|",
        *[f"| {a} | {b} | {n} |" for a, b, n in top_confusions(confusion, classes)],
        "",
        "Licence des données : ESC-50, CC BY-NC 3.0 — modèle réservé à un usage non commercial.",
        "",
    ]
    (reports / "classifier_cv.md").write_text("\n".join(lines), encoding="utf-8")


def write_autoencoder_report(summary: dict[str, Any], reports: Path) -> None:
    lines = [
        "# Autoencodeur — détection d'anomalies sur ESC-50",
        "",
        f"Révision `{summary['git']}` · {summary['epochs']} époques · {summary['parameters']:,} paramètres.",
        "",
        "Protocole : l'autoencodeur n'apprend que des classes « ordinaires » ; les classes ci-dessous",
        "ne sont jamais vues à l'entraînement et jouent le rôle d'anomalies. Chaque pli officiel sert",
        "une fois de test. Score d'un clip = maximum de l'erreur de reconstruction sur ses fenêtres",
        "sonores de 1 s ; score d'une fenêtre = son erreur de reconstruction (cas du navigateur).",
        "",
        f"Classes anomalies : {', '.join(summary['anomaly_classes'])}.",
        "",
        "| Pli | AUC-ROC (clip) | pAUC 0,1 (clip) | AUC-ROC (fenêtre) |",
        "|---|---|---|---|",
    ]
    for f in summary["folds"]:
        lines.append(f"| {f['fold']} | {f['clip_auc']:.3f} | {f['clip_pauc']:.3f} | {f['window_auc']:.3f} |")
    m, s = summary["mean"], summary["std"]
    lines += [
        f"| **moyenne ± écart-type** | **{m['clip_auc']:.3f} ± {s['clip_auc']:.3f}** | "
        f"**{m['clip_pauc']:.3f} ± {s['clip_pauc']:.3f}** | "
        f"**{m['window_auc']:.3f} ± {s['window_auc']:.3f}** |",
        "",
        "## AUC-ROC par classe anomalie (clips, 5 plis cumulés, contre les clips normaux)",
        "",
        "| Classe | AUC-ROC |",
        "|---|---|",
        *[f"| {c} | {a:.3f} |" for c, a in sorted(summary["per_class_auc"].items(), key=lambda kv: -kv[1])],
        "",
        "Une AUC de 0,5 correspond au hasard. Les sons stationnaires proches d'une ambiance ordinaire",
        "sont attendus plus bas : la calibration locale (phase 4) complète ce score générique.",
        "",
        "Licence des données : ESC-50, CC BY-NC 3.0 — modèle réservé à un usage non commercial.",
        "",
    ]
    (reports / "autoencoder.md").write_text("\n".join(lines), encoding="utf-8")
