# SoundGuard AI

Assistant vocal intelligent de surveillance sonore : classification d'événements sonores,
détection d'anomalies acoustiques inconnues et dialogue proactif avec l'utilisateur.

> Projet en cours de développement. Démo, captures et métriques à venir.

## Idée

- **Écouter** l'ambiance sonore autorisée, dans le navigateur, sans envoyer l'audio.
- **Reconnaître** les sons connus (alarme, verre brisé, choc, bruit mécanique…).
- **Remarquer** ce qui est inhabituel, même si ce son n'a jamais été appris.
- **Parler** : l'assistant ouvre la conversation, explique, recommande.

## Pile

React + TypeScript, Web Audio API, ONNX Runtime Web, MediaPipe (YAMNet) · FastAPI ·
PyTorch, librosa (entraînement) · LLM via Groq ou Ollama. Hébergement entièrement gratuit.

## Démarrage local

Prérequis : Node.js 24 (voir `frontend/.nvmrc`), Python 3.11+ et [uv](https://docs.astral.sh/uv/).

```bash
# frontend
cd frontend
npm ci
npm run dev          # serveur de développement (http://localhost:5173)
npm run build        # vérification des types puis build de production
npm test             # tests Vitest
npm run lint         # ESLint
npm run typecheck    # TypeScript strict
npm run format       # Prettier

# backend
cd backend
uv sync
uv run uvicorn app.main:app --reload   # http://localhost:8000/api/health
uv run pytest
uv run ruff check . && uv run ruff format --check .

# ml
cd ml
uv sync              # dépendances d'entraînement (PyTorch…) : uv sync --extra train, à partir de la phase 3
uv run pytest
uv run ruff check .
```

La configuration d'exemple se trouve dans `.env.example`.

## Métriques mesurées

Évaluation sur ESC-50 (2 000 clips, 50 classes), validation croisée sur les **5 plis officiels**
(jamais mélangés). Détails, matrices de confusion et protocoles : [`ml/reports/`](ml/reports/).

| Modèle | Exactitude (clip) | F1 macro | Exactitude (fenêtre 1 s) | Taille |
|---|---|---|---|---|
| CNN maison (850 k paramètres, log-mel dans le graphe ONNX) | 82,8 ± 1,6 % | 81,8 ± 1,6 % | 69,4 ± 2,0 % | 4,6 Mo |
| YAMNet + régression logistique (référence) | 81,2 ± 1,9 % | 81,3 ± 1,9 % | — | 4,1 Mo |

Détection d'anomalies (autoencodeur, 1,4 Mo) : 8 classes jamais vues à l'entraînement contre
42 classes « ordinaires ». AUC-ROC par clip : **0,683 ± 0,018** avec la distance à la ligne de base
des embeddings, 0,605 ± 0,022 avec l'erreur de reconstruction seule. C'est un résultat modeste,
sur un protocole plus difficile que l'usage réel (la « normalité » y couvre 42 classes très
différentes, au lieu de l'ambiance d'une seule pièce).

Parité PyTorch / ONNX Runtime sur des fenêtres réelles : écart maximal 3,8 × 10⁻⁶ (tolérance 10⁻³).

## Documents

| Fichier | Contenu |
|---|---|
| `docs/SPEC.md` | Fonctionnalités, scénario, règles de l'assistant |
| `docs/ARCHITECTURE.md` | Chaîne audio, modèles, anomalies, backend, tests |
| `docs/DESIGN.md` | Direction visuelle « poste d'écoute » |
| `docs/ROADMAP.md` | Phases et critères d'acceptation |
| `docs/DEPLOYMENT.md` | Mise en ligne gratuite |

## Licences des modèles et des données

- YAMNet : Apache-2.0 (Google). Sons de démonstration : voir `frontend/public/samples/SAMPLES.md`.
- Les modèles maison sont entraînés sur ESC-50 (K. J. Piczak), sous licence **CC BY-NC 3.0** :
  ils sont réservés à un usage non commercial.

## Avertissement

Projet de recherche et de démonstration. Ce n'est pas un dispositif de sécurité certifié.
