// Tous les textes d'interface passent par ce fichier (prévoir en.ts).
export const fr = {
  app: {
    name: 'SoundGuard',
    tagline: 'Poste d’écoute acoustique',
  },
  status: {
    label: 'état',
    idle: 'à l’arrêt',
    consent: 'autorisation',
    calibrating: 'calibration',
    monitoring: 'écoute',
    paused: 'pause',
    error: 'micro indisponible',
  },
  consent: {
    title: 'Avant d’écouter',
    intro:
      'SoundGuard écoute l’ambiance sonore de la pièce pour repérer les bruits inhabituels et t’en parler.',
    points: [
      'Le son est analysé uniquement dans ce navigateur. Aucun enregistrement n’est envoyé.',
      'L’écoute ne commence qu’avec ton accord. Tu peux la mettre en pause ou l’arrêter à tout moment.',
      'Un indicateur « micro actif » reste visible tant que l’écoute est en cours.',
      'Ce n’est pas un dispositif de sécurité certifié.',
    ],
    accept: 'Autoriser le micro et commencer',
    pending: 'En attente de l’autorisation du navigateur…',
    retry: 'Réessayer',
  },
  captureError: {
    denied: {
      title: 'Accès au micro refusé',
      body: 'Pour réessayer, ouvre les paramètres du site (icône à gauche de l’adresse), autorise le micro, puis clique sur « Réessayer ».',
    },
    'no-device': {
      title: 'Aucun micro trouvé',
      body: 'Branche ou active un micro, puis réessaie.',
    },
    busy: {
      title: 'Micro occupé',
      body: 'Une autre application utilise peut-être le micro. Ferme-la, puis réessaie.',
    },
    insecure: {
      title: 'Connexion non sécurisée',
      body: 'Le navigateur n’autorise le micro que sur une page en HTTPS ou en local.',
    },
    unsupported: {
      title: 'Navigateur non compatible',
      body: 'Ce navigateur ne permet pas la capture audio nécessaire. Essaie une version récente de Chrome, Edge ou Firefox.',
    },
    unknown: {
      title: 'Le micro n’a pas pu démarrer',
      body: 'Une erreur inattendue s’est produite. Réessaie dans un instant.',
    },
  },
} as const;

export type Messages = typeof fr;
