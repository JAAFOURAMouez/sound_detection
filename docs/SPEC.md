# Spécification fonctionnelle

## Vision

Un assistant classique attend une commande. SoundGuard AI écoute l'ambiance sonore autorisée,
remarque ce qui sort de l'ordinaire et **prend l'initiative** de la conversation.

Apport scientifique à mettre en avant : combiner la **classification supervisée** d'événements
connus avec la **détection non supervisée** d'anomalies inconnues, puis faire raisonner un LLM
sur ces deux signaux et sur le contexte récent.

## Scénario de référence

1. L'utilisateur ouvre l'application, lit l'écran de consentement, autorise le micro.
2. Calibration : l'application écoute 30 à 60 s d'ambiance « normale » et apprend la ligne de base.
3. Surveillance : classification et score d'anomalie en continu.
4. Un bruit inhabituel survient (verre brisé, alarme, choc, bruit mécanique…).
5. L'assistant dit : « J'ai détecté un bruit inhabituel. Souhaites-tu que j'analyse sa nature ? »
6. L'utilisateur répond à la voix ou au clavier.
7. L'assistant explique (catégorie probable, confiance, ce qui le distingue de l'ambiance
   habituelle) et propose une recommandation proportionnée.
8. L'événement est enregistré dans l'historique et visible dans le tableau de bord.

## Fonctionnalités

| # | Fonction | Détail | Priorité |
|---|---|---|---|
| F1 | Classification des sons | Top-k des classes sur fenêtre glissante, avec confiance | Indispensable |
| F2 | Détection d'anomalies | Erreur de reconstruction d'un autoencodeur, seuil calibré sur l'ambiance | Indispensable |
| F3 | Événements critiques | Alarme, sirène, verre brisé, choc, cri, bruit mécanique, détecteur de fumée : regroupement des classes en familles avec niveau de gravité | Indispensable |
| F4 | Contexte sonore | Résumé de la dernière minute : classes dominantes, niveau en dB, stabilité | Indispensable |
| F5 | Dialogue proactif | L'assistant ouvre la conversation ; voix et texte | Indispensable |
| F6 | Historique et tableau de bord | Chronologie, filtres, statistiques par famille, export JSON/CSV | Indispensable |
| F7 | Détection de dérive | Changement lent de l'ambiance (distribution des classes, niveau moyen) signalé sans alarme | Important |
| F8 | Mode démonstration | Rejouer des sons d'exemple sans micro, pour montrer le projet partout | Important |
| F9 | Rapport de session | Synthèse rédigée par le LLM à partir de l'historique | Bonus |
| F10 | Mode précision | Modèle AST chargé à la demande (WebGPU) pour ré-analyser un événement | Bonus |

## États de l'application

`idle` → `consent` → `calibrating` → `monitoring` ⇄ `dialog` → `monitoring`, avec `paused`
accessible à tout moment et `demo` comme variante de `monitoring` sans micro.

## Règles de l'assistant

- Il parle peu. Une question à la fois, phrases courtes, tutoiement, français par défaut.
- Il annonce toujours son incertitude : « probablement », confiance chiffrée sur demande.
- Il ne dramatise pas : la recommandation dépend de la gravité (information, vérification,
  alerte). Pour un danger potentiel réel (fumée, cri), il conseille de vérifier sur place
  et rappelle qu'il n'est pas un dispositif de sécurité certifié.
- Anti-harcèlement : au plus une interpellation toutes les 30 s ; les événements proches sont
  fusionnés ; l'utilisateur peut dire « ignore ce type de bruit » (liste d'exclusion par session).
- Il ne tente jamais d'identifier une personne ni de transcrire des conversations ambiantes.
  La reconnaissance vocale n'est active que pendant un tour de parole de l'utilisateur.

## Exigences non fonctionnelles

- Latence entre le son et l'affichage de l'événement : moins de 2 s sur un portable ordinaire.
- Fonctionne sans backend (dialogue dégradé par gabarits).
- Accessible : navigation clavier, contrastes AA, respect de `prefers-reduced-motion`,
  toute information portée par le son ou la couleur a un équivalent texte.
- Responsive jusqu'à 380 px de large.
- Chrome et Edge complets ; Firefox et Safari avec repli texte pour la reconnaissance vocale.

## Hors périmètre

Comptes utilisateurs, multi-capteurs, application mobile native, stockage de l'audio sur serveur,
certification sécurité.
