// Tous les textes d'interface passent par ce fichier (prévoir en.ts).
export const fr = {
  app: {
    name: 'SoundGuard',
    tagline: 'Poste d’écoute acoustique',
    status: 'état : à l’arrêt',
  },
} as const;

export type Messages = typeof fr;
