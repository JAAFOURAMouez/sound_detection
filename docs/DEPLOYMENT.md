# Déploiement gratuit

Les offres gratuites changent souvent. **Avant de déployer, revérifier les conditions
actuelles de chaque service** (quotas, mise en veille, carte bancaire exigée ou non).

## Principe

| Brique | Hébergement | Pourquoi |
|---|---|---|
| Frontend + modèles ONNX/TFLite | GitHub Pages (ou Cloudflare Pages / Vercel) | site statique, HTTPS fourni (obligatoire pour le micro) |
| Backend FastAPI léger | Render, offre web service gratuite (ou équivalent) | pas de PyTorch, faible mémoire |
| LLM | Groq, offre gratuite à débit limité | rapide, API compatible OpenAI |
| Historique | IndexedDB dans le navigateur | aucun serveur de données à payer |

Note : les Spaces Docker de Hugging Face ne sont plus créables avec un compte gratuit
(constat de novembre 2026) ; seuls les Spaces statiques le restent. C'est une des raisons
du choix « inférence dans le navigateur ». Un Space statique reste une option valable
pour héberger le frontend.

## Frontend sur GitHub Pages

1. `vite.config.ts` : `base: '/<nom-du-depot>/'`.
2. Workflow `.github/workflows/deploy.yml` : build puis `actions/deploy-pages`.
3. Variable de build `VITE_API_URL` pointant vers le backend.
4. Routage : `HashRouter` ou copie de `index.html` en `404.html`.
5. Vérifier que les fichiers `.wasm`, `.onnx`, `.tflite` sont servis et mis en cache.
   Le multithread WASM exige des en-têtes COOP/COEP que GitHub Pages ne permet pas de
   régler : rester en mono-thread, ou passer à Cloudflare Pages (fichier `_headers`).

## Backend sur Render

1. `render.yaml` à la racine : service web Python, `rootDir: backend`,
   démarrage `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. Variables : `LLM_PROVIDER=groq`, `LLM_MODEL`, `GROQ_API_KEY`, `ALLOWED_ORIGINS`.
3. L'instance gratuite s'endort après une période d'inactivité ; le premier appel peut
   prendre plusieurs dizaines de secondes. Parades prévues dans l'application :
   appel de réveil à `/api/health` dès l'ouverture de la page, et réponses de repli locales.

Variante sans serveur : la même logique en fonction serverless Python sur Vercel si Render
ne convient plus.

## LLM

- Créer une clé sur la console Groq, choisir un modèle disponible dans l'offre gratuite
  et le mettre dans `LLM_MODEL`. Les limites s'appliquent par organisation et par modèle :
  consulter la page des limites du compte.
- En local : `LLM_PROVIDER=ollama` avec un modèle léger, ou `mock` pour les tests.
- Le backend limite le débit par IP pour protéger le quota.

## Liste de contrôle avant mise en ligne

- [ ] Aucune clé dans le dépôt, l'historique git ou `frontend/dist`
- [ ] CORS limité à l'URL du frontend
- [ ] Mode démonstration fonctionnel sans micro ni backend
- [ ] Écran de consentement et indicateur micro actif
- [ ] Licences des modèles, jeux de données et échantillons listées dans le README
- [ ] Test sur un navigateur vierge, sur ordinateur et sur téléphone
