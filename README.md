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

## Documents

| Fichier | Contenu |
|---|---|
| `docs/SPEC.md` | Fonctionnalités, scénario, règles de l'assistant |
| `docs/ARCHITECTURE.md` | Chaîne audio, modèles, anomalies, backend, tests |
| `docs/DESIGN.md` | Direction visuelle « poste d'écoute » |
| `docs/ROADMAP.md` | Phases et critères d'acceptation |
| `docs/DEPLOYMENT.md` | Mise en ligne gratuite |

## Avertissement

Projet de recherche et de démonstration. Ce n'est pas un dispositif de sécurité certifié.
