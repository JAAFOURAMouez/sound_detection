"""Référence YAMNet sur ESC-50 : régression logistique sur les 521 scores, pli par pli.

Les classes de YAMNet (AudioSet) ne sont pas celles d'ESC-50 : on mesure donc ce qu'un
classifieur linéaire tire des scores YAMNet moyennés sur le clip (sonde linéaire).

    python -m soundguard_ml.eval_yamnet
"""

from __future__ import annotations

import time

import numpy as np

from soundguard_ml import data as esc
from soundguard_ml.common import ML_ROOT, REPORTS, git_revision, sliding_windows, write_json
from soundguard_ml.metrics import accuracy, macro_f1

YAMNET_PATH = ML_ROOT.parent / "frontend" / "public" / "models" / "yamnet.tflite"
YAMNET_WINDOW = 15_600
HOP = 8_000


def yamnet_features(dataset: esc.Esc50) -> np.ndarray:
    from ai_edge_litert.interpreter import Interpreter

    interpreter = Interpreter(model_path=str(YAMNET_PATH))
    interpreter.allocate_tensors()
    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    shape = tuple(int(d) for d in inp["shape"])
    if int(np.prod(shape)) != YAMNET_WINDOW:
        raise ValueError(f"Entrée YAMNet inattendue : {shape}")
    features = np.zeros((len(dataset.targets), 521), dtype=np.float32)
    start = time.time()
    for i in range(len(dataset.targets)):
        windows = sliding_windows(np.asarray(dataset.waveforms[i]), YAMNET_WINDOW, HOP, -50)
        scores = []
        for w in windows:
            interpreter.set_tensor(inp["index"], w.astype(np.float32).reshape(shape))
            interpreter.invoke()
            scores.append(interpreter.get_tensor(out["index"]).reshape(-1, 521).mean(axis=0))
        features[i] = np.mean(scores, axis=0)
        if (i + 1) % 400 == 0:
            print(f"{i + 1}/{len(dataset.targets)} clips ({time.time() - start:.0f} s)", flush=True)
    return features


def main() -> None:
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    dataset = esc.load()
    cache = ML_ROOT / "data" / "yamnet_features.npy"
    if cache.exists():
        features = np.load(cache)
    else:
        features = yamnet_features(dataset)
        np.save(cache, features)

    per_fold = []
    for test_fold, train_folds in esc.cross_validation_splits():
        tr, te = dataset.indices(train_folds), dataset.indices({test_fold})
        clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=3_000, C=0.5))
        clf.fit(features[tr], dataset.targets[tr])
        pred = clf.predict(features[te])
        per_fold.append(
            {
                "fold": test_fold,
                "clip_accuracy": accuracy(dataset.targets[te], pred),
                "clip_macro_f1": macro_f1(dataset.targets[te], pred, 50),
            }
        )
        print(f"[pli {test_fold}] exactitude {per_fold[-1]['clip_accuracy']:.3f}")
    keys = ["clip_accuracy", "clip_macro_f1"]
    summary = {
        "git": git_revision(),
        "method": "Régression logistique (C=0,5) sur les 521 scores YAMNet moyennés par clip",
        "folds": per_fold,
        "mean": {k: float(np.mean([f[k] for f in per_fold])) for k in keys},
        "std": {k: float(np.std([f[k] for f in per_fold])) for k in keys},
    }
    write_json(REPORTS / "yamnet_probe.json", summary)
    print(f"Moyenne : {summary['mean']}")


if __name__ == "__main__":
    main()
