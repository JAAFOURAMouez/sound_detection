"""Tableau comparatif des modèles à partir des rapports JSON : ml/reports/comparison.md.

python -m soundguard_ml.compare
"""

from __future__ import annotations

import json

from soundguard_ml.common import REPORTS


def _load(name: str) -> dict | None:
    path = REPORTS / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _cell(summary: dict | None, key: str) -> str:
    if not summary or key not in summary["mean"]:
        return "—"
    return f"{100 * summary['mean'][key]:.1f} ± {100 * summary['std'][key]:.1f} %"


def main() -> None:
    cnn = _load("classifier_cv.json")
    yamnet = _load("yamnet_probe.json")
    export = _load("export.json")
    ae = _load("autoencoder.json")
    size = lambda name: (  # noqa: E731
        f"{export['models'][name]['bytes'] / 1e6:.2f} Mo" if export and name in export["models"] else "—"
    )
    lines = [
        "# Comparaison des classifieurs sur ESC-50 (5 plis officiels)",
        "",
        "| Modèle | Exactitude (clip) | F1 macro (clip) | Exactitude (fenêtre 1 s) | Taille | Exécution |",
        "|---|---|---|---|---|---|",
        f"| CNN maison (front-end log-mel dans le graphe) | {_cell(cnn, 'clip_accuracy')} | "
        f"{_cell(cnn, 'clip_macro_f1')} | {_cell(cnn, 'window_accuracy')} | {size('classifier')} | "
        "ONNX Runtime Web |",
        f"| YAMNet + régression logistique (sonde linéaire) | {_cell(yamnet, 'clip_accuracy')} | "
        f"{_cell(yamnet, 'clip_macro_f1')} | — | 4,13 Mo (+ sonde) | MediaPipe (TFLite) |",
        "| PANNs CNN14 / AST | non évalués (reportés aux bonus) | | | | |",
        "",
        "YAMNet n'est pas réentraîné : seule une couche linéaire apprend sur ses 521 scores, ce qui",
        "mesure la qualité de ses représentations pour ESC-50. Le CNN maison apprend tout, sur des",
        "fenêtres de 1 s, à partir de 1 600 clips par pli.",
        "",
    ]
    if ae:
        lines += [
            "## Autoencodeur d'anomalies",
            "",
            "| Score | AUC-ROC (clip) | pAUC 0,1 (clip) | AUC-ROC (fenêtre 1 s) |",
            "|---|---|---|---|",
            *[
                f"| {label} | {ae['mean'][p + 'clip_auc']:.3f} ± {ae['std'][p + 'clip_auc']:.3f} "
                f"| {ae['mean'][p + 'clip_pauc']:.3f} | {ae['mean'][p + 'window_auc']:.3f} |"
                for label, p in [
                    ("reconstruction", ""),
                    ("embedding", "emb_"),
                    ("combiné (max des z, navigateur)", "comb_"),
                    ("somme des z", "sum_"),
                ]
            ],
            "",
            f"Taille {size('autoencoder')}. Détails : `autoencoder.md`.",
            "",
        ]
    if export:
        lines += [
            "## Export",
            "",
            f"Parité PyTorch / ONNX Runtime ({export['parity_inputs']}), tolérance {export['tolerance']} :",
            "",
            *[
                f"- `{m['file']}` : écart max {max(m['max_abs_diff'].values()):.2e} "
                f"({'conforme' if m['parity_ok'] else 'NON conforme'})"
                for m in export["models"].values()
            ],
            f"- Taille totale des modèles exportés : {export['total_bytes'] / 1e6:.2f} Mo "
            f"(budget 15 Mo : {'respecté' if export['within_budget'] else 'dépassé'}).",
            "",
        ]
    (REPORTS / "comparison.md").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
