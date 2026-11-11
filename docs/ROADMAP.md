# Feuille de route

Les phases se font dans l'ordre. Ne pas enchaîner deux phases sans validation.

L'ordre est voulu : une démonstration visible existe dès la phase 2 grâce à YAMNet, avant
tout entraînement.

## Phase 0 — Socle

Objectif : mettre en place le monorepo : frontend Vite + React + TS
strict + Tailwind, backend FastAPI minimal avec /api/health, dossier ml/ avec pyproject,
lint, formatage, tests vides qui passent, CI GitHub Actions. 

Critères : `npm run build`, `npm test`, `pytest` (back et ml), `ruff` passent en local et en CI.

## Phase 1 — Capture et visualisation

Écran de consentement, capture micro par AudioWorklet, rééchantillonnage 16 kHz, tampon
circulaire, vu-mètre en dB, spectrogramme mel défilant, pause/reprise, indicateur micro actif.
Jetons de design et structure de l'écran principal (radar encore vide).

Critères : tests du rééchantillonnage sur sinusoïdes (fréquence conservée, pas de repliement) ;
60 images/s pendant la capture ; refus du micro géré proprement.

## Phase 2 — Classification de référence

Intégrer YAMNet via MediaPipe Audio Classifier dans un Web Worker. Afficher le top-3 en direct.
Créer `families.json` (classes AudioSet → familles + gravité). Mode démonstration avec
échantillons dans `public/samples/` (licences vérifiées et listées dans `SAMPLES.md`).

Critères : latence son → étiquette inférieure à 1,5 s ; les échantillons « alarme », « verre »,
« choc » tombent dans la bonne famille ; le modèle est mis en cache après le premier chargement.

## Phase 3 — Entraînement et export (ml/)

Chargeur ESC-50 (plis officiels), classifieur CNN avec front-end log-mel dans le graphe,
autoencodeur convolutif, scripts d'entraînement reproductibles (graine, config YAML),
notebook Colab, export ONNX, `model-card.json`, rapport `ml/reports/`.
Comparer : CNN maison, YAMNet, et si possible PANNs CNN14 / AST hors-ligne.

Critères : validation croisée 5 plis rapportée (exactitude, F1 macro, matrice de confusion) ;
AUC-ROC de l'autoencodeur sur le protocole à classes exclues ; test de parité PyTorch / ONNX
à 1e-3 ; modèles exportés de moins de 15 Mo au total.

## Phase 4 — Anomalies dans le navigateur

Charger l'autoencodeur avec onnxruntime-web dans le worker. Calibration de 30 à 60 s,
seuil `médiane + k × MAD`, distance à la ligne de base, score lissé. Détection de dérive.
Possibilité de basculer entre YAMNet et le CNN maison.

Critères : sur une ambiance calme calibrée, moins d'une fausse alerte par 10 minutes ;
un échantillon inconnu injecté dépasse le seuil ; tests unitaires de la calibration et de la
dérive sur données synthétiques ; test de parité ONNX Runtime Web vs Python.

## Phase 5 — Événements, historique, radar

Moteur d'événements pur (hystérésis, fusion, types `known` / `unknown` / `drift`),
persistance Dexie, radar acoustique, journal, vue Historique, export JSON/CSV, suppression
des données.

Critères : tests du moteur sur séquences scénarisées ; l'historique survit au rechargement ;
le radar et la frise restent fluides avec 500 événements.

## Phase 6 — Assistant vocal

Backend : `LLMProvider` (Groq, Ollama, mock), `/api/chat`, `/api/report`, prompt système,
sortie JSON validée, limite de débit, CORS. Frontend : machine à états du dialogue,
interpellation proactive, STT/TTS avec repli texte, sourdine pendant la parole,
réponses de repli sans backend, liste « ignorer ce type de bruit ».

Critères : parcours Playwright complet en mode démonstration avec `MockProvider` ;
l'assistant ne se déclenche pas sur sa propre voix ; aucune clé dans le bundle
(`grep` sur `dist/`) ; au plus une interpellation par 30 s.

## Phase 7 — Finition visuelle et accessibilité

Appliquer intégralement `docs/DESIGN.md` : radar abouti, typographie, états, mouvement,
responsive, `prefers-reduced-motion`, navigation clavier, contrastes. Page « À propos »
expliquant l'architecture et les limites.

Critères : ceux de la section « Critères d'acceptation visuels » ; score Lighthouse
accessibilité d'au moins 95 ; bundle initial hors modèles inférieur à 300 Ko compressé.

## Phase 8 — Déploiement et vitrine

Suivre `docs/DEPLOYMENT.md`. README de qualité portfolio : démo en ligne, GIF, schéma
d'architecture, tableau des métriques, limites, pistes. Rapport de session (F9).

Critères : URL publique fonctionnelle sur un navigateur vierge ; le mode démonstration marche
sans micro et sans backend ; coût : 0 €.

## Bonus

- Mode précision AST via Transformers.js et WebGPU.
- Sous-ensemble MIMII / DCASE Task 2 pour le cas « machine d'atelier ».
- PWA installable, fonctionnement hors-ligne.
- Interface en anglais.
