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
