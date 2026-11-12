# Autoencodeur — détection d'anomalies sur ESC-50

Révision `6a68c96` · 80 époques · 70,793 paramètres · goulot de 32 canaux.

Protocole : l'autoencodeur n'apprend que des classes « ordinaires » ; les classes ci-dessous
ne sont jamais vues à l'entraînement et jouent le rôle d'anomalies. Chaque pli officiel sert
une fois de test. Deux scores sont évalués pour chaque fenêtre sonore de 1 s :

- **reconstruction** : erreur quadratique moyenne de reconstruction du log-mel ;
- **embedding** : distance de Mahalanobis (covariance diagonale) entre l'embedding du goulot
  et la distribution des embeddings d'entraînement — c'est le principe de la calibration
  locale prévue dans le navigateur (phase 4), ici avec une « ambiance » de 42 classes variées ;
- **combiné** : somme des deux scores normalisés par médiane et MAD des fenêtres d'entraînement
  (la normalisation `médiane + k × MAD` prévue dans le navigateur).

Score d'un clip = maximum sur ses fenêtres sonores.

Classes anomalies : glass_breaking, siren, crying_baby, door_wood_knock, chainsaw, fireworks, car_horn, can_opening.

| Score | AUC-ROC (clip) | pAUC 0,1 (clip) | AUC-ROC (fenêtre) |
|---|---|---|---|
| reconstruction | 0.605 ± 0.022 | 0.095 ± 0.027 | 0.520 ± 0.016 |
| embedding | 0.683 ± 0.018 | 0.119 ± 0.039 | 0.578 ± 0.020 |
| **combiné** | **0.627 ± 0.023** | **0.111 ± 0.033** | **0.585 ± 0.019** |

## Par pli

| Pli | Reconstruction (clip) | Embedding (clip) | Combiné (clip) |
|---|---|---|---|
| 1 | 0.633 | 0.670 | 0.624 |
| 2 | 0.602 | 0.666 | 0.638 |
| 3 | 0.566 | 0.673 | 0.585 |
| 4 | 0.612 | 0.715 | 0.640 |
| 5 | 0.612 | 0.690 | 0.650 |

## AUC-ROC par classe anomalie (clips, 5 plis cumulés, contre les clips normaux)

| Classe | Reconstruction | Embedding | Combiné |
|---|---|---|---|
| crying_baby | 0.915 | 0.549 | 0.892 |
| siren | 0.782 | 0.619 | 0.802 |
| car_horn | 0.636 | 0.617 | 0.643 |
| chainsaw | 0.278 | 0.773 | 0.633 |
| can_opening | 0.592 | 0.748 | 0.564 |
| fireworks | 0.621 | 0.499 | 0.534 |
| glass_breaking | 0.516 | 0.825 | 0.484 |
| door_wood_knock | 0.499 | 0.824 | 0.464 |

Une AUC de 0,5 correspond au hasard, une AUC inférieure à 0,5 à un son jugé *plus* ordinaire
que la moyenne. Ce protocole est plus difficile que l'usage réel : la « normalité » y couvre
42 classes très différentes, alors que dans le navigateur elle se limite à l'ambiance de la pièce.

Licence des données : ESC-50, CC BY-NC 3.0 — modèle réservé à un usage non commercial.
