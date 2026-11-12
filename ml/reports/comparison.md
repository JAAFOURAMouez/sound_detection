# Comparaison des classifieurs sur ESC-50 (5 plis officiels)

| Modèle | Exactitude (clip) | F1 macro (clip) | Exactitude (fenêtre 1 s) | Taille | Exécution |
|---|---|---|---|---|---|
| CNN maison (front-end log-mel dans le graphe) | 82.8 ± 1.6 % | 81.8 ± 1.6 % | 69.4 ± 2.0 % | 4.53 Mo | ONNX Runtime Web |
| YAMNet + régression logistique (sonde linéaire) | 81.2 ± 1.9 % | 81.3 ± 1.9 % | — | 4,13 Mo (+ sonde) | MediaPipe (TFLite) |
| PANNs CNN14 / AST | non évalués (reportés aux bonus) | | | | |

YAMNet n'est pas réentraîné : seule une couche linéaire apprend sur ses 521 scores, ce qui
mesure la qualité de ses représentations pour ESC-50. Le CNN maison apprend tout, sur des
fenêtres de 1 s, à partir de 1 600 clips par pli.

## Autoencodeur d'anomalies

| Score | AUC-ROC (clip) | pAUC 0,1 (clip) | AUC-ROC (fenêtre 1 s) |
|---|---|---|---|
| reconstruction | 0.605 ± 0.022 | 0.095 | 0.520 |
| embedding | 0.683 ± 0.018 | 0.119 | 0.578 |
| combiné (max des z, navigateur) | 0.698 ± 0.019 | 0.104 | 0.632 |
| somme des z | 0.627 ± 0.023 | 0.111 | 0.585 |

Taille 1.41 Mo. Détails : `autoencoder.md`.

## Export

Parité PyTorch / ONNX Runtime (ESC-50 (16 fenêtres réelles)), tolérance 0.001 :

- `classifier.onnx` : écart max 3.81e-06 (conforme)
- `autoencoder.onnx` : écart max 1.79e-07 (conforme)
- Taille totale des modèles exportés : 5.94 Mo (budget 15 Mo : respecté).
