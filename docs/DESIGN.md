# Direction visuelle

## Concept : « poste d'écoute »

L'interface n'est pas un tableau de bord d'entreprise. C'est un **instrument** : on doit penser
à un sonar, à un oscilloscope, à une console de régie son. L'élément central n'est pas une
grille de cartes mais un **radar acoustique** vivant.

## Écran principal

```
┌───────────────────────────────────────────────────────────────┐
│ SOUNDGUARD ▪ état : ÉCOUTE          niveau ▂▃▅▃▂   ⏸  ⚙      │
├───────────────────────────────┬───────────────────────────────┤
│                               │  JOURNAL                      │
│         RADAR ACOUSTIQUE      │  22:04:12  VERRE   0.91  ▮▮▮  │
│   (cercle, balayage rotatif,  │  22:01:40  INCONNU 0.74  ▮▮   │
│    chaque événement = écho)   │  21:58:03  dérive  —     ▮    │
│                               │                               │
├───────────────────────────────┴───────────────────────────────┤
│ SPECTROGRAMME MEL DÉFILANT (canvas, pleine largeur)           │
├───────────────────────────────────────────────────────────────┤
│ ◉ « J'ai détecté un bruit inhabituel. Souhaites-tu… »   🎙 ⌨  │
└───────────────────────────────────────────────────────────────┘
```

- **Radar** : le temps est l'angle (un tour = la dernière minute), le score d'anomalie est la
  distance au centre. Un événement apparaît comme un écho lumineux qui s'estompe ; sa couleur
  donne la famille, sa taille la gravité. Clic sur un écho : fiche de l'événement.
  Pendant la calibration, un anneau se remplit pour matérialiser la ligne de base.
- **Spectrogramme** : défile de droite à gauche, palette perceptuelle sombre (type *magma*
  ou *inferno*), les segments anormaux sont encadrés d'un liseré.
- **Voix de l'assistant** : pas de bulles de messagerie. Une ligne de « transmission » en bas,
  texte qui s'écrit, forme d'onde qui réagit quand il parle et quand l'utilisateur répond.
- **Journal** : typographie à chasse fixe, une ligne par événement, lisible comme un relevé.
- **Vue Historique** : frise chronologique horizontale de la session + répartition par famille
  + courbe du score d'anomalie. Les graphiques reprennent le langage visuel du radar.

## Identité

- Fond presque noir légèrement bleuté ; une seule couleur d'accent « phosphore » ; l'ambre et
  le rouge sont réservés aux niveaux de gravité et ne servent jamais de décoration.
- Deux polices libres : une à chasse fixe pour les données (par ex. JetBrains Mono ou
  IBM Plex Mono), une grotesque pour le texte. Auto-hébergées, pas de CDN tiers.
- Grille fine, graduations, étiquettes en petites capitales : le vocabulaire d'un instrument
  de mesure. Très léger grain ou lignes de balayage, désactivé si `prefers-reduced-motion`.
- Définir les jetons (couleurs, espacements, rayons, durées) dans `src/ui/tokens.css` avant
  tout composant. Thème clair « papier millimétré » en option, après le thème sombre.

## Mouvement

- Le mouvement porte une information : balayage = le système écoute, pulsation = événement,
  onde = quelqu'un parle. Rien ne bouge sans raison.
- 60 images/s : radar et spectrogramme en `<canvas>` (2D ou WebGL), pas en DOM ni en SVG animé.
- `prefers-reduced-motion` : balayage figé, apparitions par fondu simple.

## Ressources open source autorisées (dépôts GitHub)

À utiliser comme **matière première à restyler**, jamais telles quelles. Vérifier la licence
et l'état de maintenance de chacune avant de l'ajouter ; préférer copier un composant précis
plutôt qu'installer une bibliothèque entière.

| Besoin | Piste |
|---|---|
| Primitives accessibles (dialogue, menu, onglets) | shadcn/ui (Radix) |
| Effets et micro-interactions | React Bits, Magic UI, Aceternity UI |
| Forme d'onde, réécoute d'un extrait | wavesurfer.js |
| Radar ou orbe 3D réactif au son (option) | three.js avec react-three-fiber |
| Animations d'interface | Motion (ex-Framer Motion) |
| Graphiques de l'historique | visx ou D3, dessinés aux couleurs du thème |
| Icônes | Lucide |

## Critères d'acceptation visuels

- Une capture d'écran de l'écran principal ne peut pas être confondue avec un gabarit
  d'administration classique.
- L'état du système (à l'arrêt, calibration, écoute, dialogue, pause) se comprend en une
  seconde sans lire de texte, et aussi sans percevoir les couleurs.
- Un indicateur « micro actif » est toujours visible pendant l'écoute.
- Contrastes AA, focus clavier visible partout, utilisable à 380 px de large
  (le radar passe au-dessus du journal, le spectrogramme reste pleine largeur).
