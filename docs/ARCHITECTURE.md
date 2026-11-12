# Architecture technique

## Pourquoi l'inférence est dans le navigateur

Les hébergeurs gratuits qui acceptent un backend Python offrent environ 512 Mo de RAM :
PyTorch et un modèle audio n'y tiennent pas de façon fiable. On déplace donc l'inférence
côté client. Avantages : coût nul, latence faible, et l'audio ne quitte jamais l'appareil,
ce qui est un argument fort pour un outil de surveillance.

```
┌──────────────────────────── Navigateur ────────────────────────────┐
│ Micro ─► AudioWorklet ─► rééchantillonnage 16 kHz ─► tampon circulaire │
│                                   │                                │
│                     Web Worker d'inférence                         │
│        ┌──────────────┬───────────┴────────────┬───────────────┐   │
│        │ Classifieur  │ Autoencodeur (ONNX)    │ Stat. contexte │   │
│        │ YAMNet / CNN │ erreur de reconstruction│ dB, dérive     │   │
│        └──────┬───────┴───────────┬────────────┴───────┬───────┘   │
│               └────────► Moteur d'événements ◄─────────┘           │
│                          │              │                          │
│                   IndexedDB (Dexie)   Assistant (machine à états)  │
│                          │              │  STT / TTS navigateur    │
│                     Tableau de bord     │                          │
└─────────────────────────────────────────┼──────────────────────────┘
                                          │ HTTPS, métadonnées seulement
                              ┌───────────▼───────────┐
                              │ FastAPI léger         │
                              │ /api/chat  /api/report│──► LLM (Groq / Ollama / mock)
                              └───────────────────────┘
```

## Chaîne audio

- `getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1 } })`
- AudioWorklet : accumule des blocs, rééchantillonne à 16 kHz (filtre passe-bas puis décimation,
  ou `OfflineAudioContext` par bloc), poste des `Float32Array` vers le worker d'inférence.
- Tampon circulaire de 10 s. Fenêtre d'analyse par défaut : 1 s (0,975 s pour YAMNet),
  pas de 0,5 s. Paramètres centralisés dans `src/audio/config.ts`.
- Un `AnalyserNode` séparé alimente uniquement la visualisation.

## Modèles

| Rôle | Modèle | Origine | Format | Usage |
|---|---|---|---|---|
| Référence | YAMNet (521 classes AudioSet) | pré-entraîné | TFLite via MediaPipe Audio Classifier | classifieur par défaut dès la phase 2 |
| Contribution | CNN compact sur log-mel (ESC-50, option UrbanSound8K) | entraîné dans `ml/` | ONNX | comparaison avec la référence, familles critiques |
| Anomalie | Autoencodeur convolutif sur log-mel | entraîné dans `ml/` | ONNX | score d'anomalie |
| Précision (bonus) | AST fine-tuné AudioSet | pré-entraîné, via Transformers.js | ONNX quantifié | ré-analyse à la demande, WebGPU |
| Référence hors-ligne | YAMNet + régression logistique | pré-entraîné | TFLite (LiteRT) | sonde linéaire sur ESC-50, rapport d'évaluation uniquement |
| Référence hors-ligne (bonus) | PANNs CNN14 / AST | pré-entraîné | PyTorch | reportés aux bonus |

Vérifier les identifiants exacts des modèles et leurs licences au moment de l'intégration.

### Classifieur (ml/)

- Entrée : forme d'onde 16 kHz, 1 s (ou 5 s pour l'entraînement ESC-50 avec recadrage aléatoire).
- Front-end dans le graphe : STFT par convolution (n_fft 512, fenêtre de Hann, pas 160, sans
  remplissage), 64 bandes mel de 50 Hz à 8 kHz (échelle de Slaney), log, normalisation globale
  apprise sur l'entraînement. n_fft 512 plutôt que 1024 : les noyaux de STFT pèsent environ 1 Mo
  au lieu de 4,2 Mo, et ils sont présents dans chacun des deux modèles exportés.
- Implémenté dans `ml/soundguard_ml/frontend.py` sans torchaudio ; banc mel vérifié contre librosa.
- Corps : 4 à 6 blocs conv-BN-ReLU-pool, pooling global, tête linéaire. Moins de 2 M de paramètres.
- Augmentations : décalage temporel, mixup, SpecAugment, bruit de fond.
- Évaluation : validation croisée sur les 5 plis officiels d'ESC-50 (ne jamais mélanger les plis),
  exactitude, F1 macro, matrice de confusion, temps d'inférence ONNX.
- Table `families.json` : regroupe les classes en familles (`alarm`, `glass`, `impact`,
  `mechanical`, `voice_distress`, `ambient`…) avec une gravité de 0 à 3.

### Détection d'anomalies

Deux étages, pour être robuste dans un environnement jamais vu :

1. **Autoencodeur générique** entraîné sur des sons ordinaires. Score brut : erreur de
   reconstruction moyenne par fenêtre (MSE sur le log-mel).
2. **Calibration locale** dans le navigateur : pendant 30 à 60 s, on collecte les scores bruts
   et les embeddings du goulot d'étranglement de l'ambiance réelle. On en tire :
   - un seuil robuste : `médiane + k × MAD` (k réglable, défaut 4) ;
   - une distance de Mahalanobis (covariance diagonale régularisée) entre l'embedding courant
     et la ligne de base.
   Score final normalisé dans [0, 1] : combinaison des deux, lissée par moyenne exponentielle.

Évaluation hors-ligne : AUC-ROC et pAUC sur un protocole « classes normales contre classes
tenues à l'écart » d'ESC-50, et si le temps le permet sur un sous-ensemble MIMII / DCASE Task 2
(bruits de machines) pour illustrer le cas industriel.

### Dérive de l'environnement (F7)

Comparer l'histogramme des familles et le niveau moyen sur une fenêtre récente (2 min) à ceux
de la ligne de base : divergence de Jensen-Shannon et écart de niveau. Au-delà d'un seuil
maintenu 30 s, émettre un événement `drift` de gravité 0, qui propose de recalibrer.

## Moteur d'événements

Fonction pure `step(state, frame) → { state, events[] }` où `frame` contient top-k, score
d'anomalie, niveau dB, horodatage.

- Déclenchement : anomalie au-dessus du seuil pendant N fenêtres consécutives, **ou** famille
  critique avec confiance suffisante.
- Hystérésis à l'ouverture et à la fermeture, fusion des événements séparés de moins de 2 s.
- Type d'événement : `known` (famille reconnue), `unknown` (anomalie sans classe fiable),
  `drift`.
- Champs : id, début, fin, type, famille, top-k, score max, niveau dB, contexte de la minute
  précédente, statut du dialogue, note de l'utilisateur. Option locale : extrait audio de 3 s
  gardé en mémoire vive pour réécoute, jamais envoyé.

## Assistant

Machine à états explicite (`idle`, `asking`, `listening`, `thinking`, `speaking`) dans
`src/assistant/machine.ts`, testable sans navigateur.

- La première phrase (« J'ai détecté un bruit inhabituel… ») est un gabarit local : réaction
  instantanée, aucun appel réseau.
- L'analyse appelle `POST /api/chat` avec l'événement, le contexte et les derniers tours.
- Sans réponse en 8 s ou en cas d'erreur : réponse de repli construite par gabarits.
- TTS : `speechSynthesis`, voix française si disponible ; la détection est mise en sourdine
  pendant la parole. STT : `SpeechRecognition` en `fr-FR`, sinon champ texte.

## Backend

```
GET  /api/health          → { status, provider }
POST /api/chat            → { reply, recommendation, severity }   (réponse JSON stricte)
POST /api/report          → synthèse de session à partir d'une liste d'événements
```

- `LLMProvider` (protocole) avec `GroqProvider`, `OllamaProvider`, `MockProvider`,
  choisi par `LLM_PROVIDER`. Le nom du modèle vient de `LLM_MODEL`, jamais codé en dur.
- Le prompt système vit dans `backend/app/prompts/assistant_fr.md` ; il impose le ton décrit
  dans la spécification et un format de sortie JSON validé par Pydantic.
- Garde-fous : CORS restreint à l'origine du frontend, limite de débit par IP en mémoire,
  taille maximale des requêtes, délais d'attente, aucun journal du contenu des conversations.
- Aucune base de données côté serveur : l'historique reste dans IndexedDB.

## Stratégie de tests

- `ml/` : formes des tenseurs, parité PyTorch / ONNX, non-régression des métriques (seuils).
- `frontend/` : rééchantillonnage sur sinusoïdes, moteur d'événements sur séquences
  synthétiques, calibration, machine à états de l'assistant ; un parcours Playwright en mode
  démonstration (charge un échantillon « verre brisé », attend l'interpellation, répond au clavier).
- `backend/` : contrat des routes avec `MockProvider`, validation du JSON du LLM, limite de débit.
