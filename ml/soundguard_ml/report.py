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


def write_autoencoder_report(summary: dict[str, Any], reports: Path, name: str = "autoencoder") -> None:
    m, s = summary["mean"], summary["std"]

    def ms(key: str) -> str:
        return f"{m[key]:.3f} ± {s[key]:.3f}"

    lines = [
        "# Autoencodeur — détection d'anomalies sur ESC-50",
        "",
        f"Révision `{summary['git']}` · {summary['epochs']} époques · {summary['parameters']:,} paramètres"
        f" · goulot de {summary['config']['model']['bottleneck']} canaux.",
        "",
        "Protocole : l'autoencodeur n'apprend que des classes « ordinaires » ; les classes ci-dessous",
        "ne sont jamais vues à l'entraînement et jouent le rôle d'anomalies. Chaque pli officiel sert",
        "une fois de test. Deux scores sont évalués pour chaque fenêtre sonore de 1 s :",
        "",
        "- **reconstruction** : erreur quadratique moyenne de reconstruction du log-mel ;",
        "- **embedding** : distance de Mahalanobis (covariance diagonale) entre l'embedding du goulot",
        "  et la distribution des embeddings d'entraînement — c'est le principe de la calibration",
        "  locale prévue dans le navigateur (phase 4), ici avec une « ambiance » de 42 classes variées ;",
        "- **combiné** : somme des deux scores normalisés par médiane et MAD des fenêtres d'entraînement",
        "  (la normalisation `médiane + k × MAD` prévue dans le navigateur).",
        "",
        "Score d'un clip = maximum sur ses fenêtres sonores.",
        "",
        f"Classes anomalies : {', '.join(summary['anomaly_classes'])}.",
        "",
        "| Score | AUC-ROC (clip) | pAUC 0,1 (clip) | AUC-ROC (fenêtre) |",
        "|---|---|---|---|",
        f"| reconstruction | {ms('clip_auc')} | {ms('clip_pauc')} | {ms('window_auc')} |",
        f"| embedding | {ms('emb_clip_auc')} | {ms('emb_clip_pauc')} | {ms('emb_window_auc')} |",
        f"| **combiné** | **{ms('comb_clip_auc')}** | **{ms('comb_clip_pauc')}** "
        f"| **{ms('comb_window_auc')}** |",
        "",
        "## Par pli",
        "",
        "| Pli | Reconstruction (clip) | Embedding (clip) | Combiné (clip) |",
        "|---|---|---|---|",
        *[
            f"| {f['fold']} | {f['clip_auc']:.3f} | {f['emb_clip_auc']:.3f} | {f['comb_clip_auc']:.3f} |"
            for f in summary["folds"]
        ],
        "",
        "## AUC-ROC par classe anomalie (clips, 5 plis cumulés, contre les clips normaux)",
        "",
        "| Classe | Reconstruction | Embedding | Combiné |",
        "|---|---|---|---|",
        *[
            f"| {c} | {v['reconstruction']:.3f} | {v['embedding']:.3f} | {v['combined']:.3f} |"
            for c, v in sorted(summary["per_class_auc"].items(), key=lambda kv: -kv[1]["combined"])
        ],
        "",
        "Une AUC de 0,5 correspond au hasard, une AUC inférieure à 0,5 à un son jugé *plus* ordinaire",
        "que la moyenne. Ce protocole est plus difficile que l'usage réel : la « normalité » y couvre",
        "42 classes très différentes, alors que dans le navigateur elle se limite à l'ambiance de la pièce.",
        "",
        "Licence des données : ESC-50, CC BY-NC 3.0 — modèle réservé à un usage non commercial.",
        "",
    ]
    (reports / f"{name}.md").write_text("\n".join(lines), encoding="utf-8")
