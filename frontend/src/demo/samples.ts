// Échantillons du mode démonstration. Licences détaillées dans public/samples/SAMPLES.md.

export interface DemoSample {
  id: string;
  file: string;
  /** Famille attendue (sert aux tests de bout en bout). */
  expectedFamily: string;
  /** Début du son dans le fichier, en secondes (1 s de silence ajoutée en tête). */
  onsetSeconds: number;
  credit: { author: string; license: string; source: string };
}

export const DEMO_SAMPLES: readonly DemoSample[] = [
  {
    id: 'alarm-smoke',
    file: 'samples/alarm-smoke.ogg',
    expectedFamily: 'smoke_fire',
    onsetSeconds: 1.11,
    credit: {
      author: 'cori',
      license: 'Domaine public',
      source: 'https://commons.wikimedia.org/wiki/File:Smoke_alarm.ogg',
    },
  },
  {
    id: 'alarm-siren',
    file: 'samples/alarm-siren.ogg',
    expectedFamily: 'alarm',
    onsetSeconds: 1.0,
    credit: {
      author: 'Techtonic',
      license: 'Domaine public',
      source: 'https://commons.wikimedia.org/wiki/File:Civil-defense-siren-waver.ogg',
    },
  },
  {
    id: 'glass-breaking',
    file: 'samples/glass-breaking.ogg',
    expectedFamily: 'glass',
    onsetSeconds: 1.0,
    credit: {
      author: 'Gravity Sound',
      license: 'CC BY 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:Glass_breaking_4_(Gravity_Sound).wav',
    },
  },
  {
    id: 'impact-thud',
    file: 'samples/impact-thud.ogg',
    expectedFamily: 'impact',
    onsetSeconds: 1.03,
    credit: {
      author: 'gregoryweir',
      license: 'Domaine public',
      source: 'https://commons.wikimedia.org/wiki/File:Dull_thud.ogg',
    },
  },
];
