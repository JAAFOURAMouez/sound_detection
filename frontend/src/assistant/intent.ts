// Compréhension minimale des réponses de l'utilisateur (pure, sans réseau).

export type Intent = 'yes' | 'no' | 'ignore' | 'stop' | 'question';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IGNORE = [
  /\bignore/,
  /\bne (me )?(le )?signale plus\b/,
  /\bne m en parle plus\b/,
  /\bplus jamais\b/,
];
const STOP = [/^(stop|silence|chut|tais toi|arrete|arrete toi|ca suffit)\b/];
const YES = [
  /^(oui|ouais|ok|okay|d accord|vas y|allez|bien sur|volontiers|carrement|yes|go)\b/,
  /^(analyse|explique|dis moi|c est quoi|qu est ce que c est)\b/,
];
const NO = [/^(non|nan|pas maintenant|laisse|c est rien|rien|plus tard|pas la peine|inutile|no)\b/];

export function parseIntent(text: string): Intent {
  const t = normalize(text);
  if (!t) return 'no';
  if (IGNORE.some((r) => r.test(t))) return 'ignore';
  if (STOP.some((r) => r.test(t))) return 'stop';
  if (NO.some((r) => r.test(t))) return 'no';
  if (YES.some((r) => r.test(t)) && t.split(' ').length <= 4) return 'yes';
  return 'question';
}
