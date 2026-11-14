// Compréhension minimale des réponses de l'utilisateur (pure, sans réseau).

export type Intent = 'yes' | 'no' | 'ignore' | 'stop' | 'question' | 'explain';

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
const NO = [
  /^(non|nan|pas maintenant|laisse|c est rien|rien|plus tard|pas la peine|inutile|no)\b/,
  /^(c est bon|ca va|tout va bien)$/,
];
const QUESTION = [
  /^(pourquoi|comment|quand|ou|qui|quel|quelle|quels|quelles|combien|que|quoi|est ce|qu est ce)\b/,
  /\b(pourquoi|est ce que|c est quoi|c etait quoi|c est grave|tu es sur|tu penses|d ou)\b/,
];
const DET = '(le|la|les|l|un|une|des|du|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos)';
/** L'utilisateur dit d'où vient le son (« c'est le chat », « la porte a claqué »…). */
const EXPLAIN = [
  new RegExp(
    `\\b(c est|c etait|ce sont|ce n est que|c est juste|c etait juste|juste) (que |seulement |simplement |juste )?(${DET}|moi|nous|lui|elle|eux|quelqu un)\\b`,
  ),
  /\bca (vient|venait) (de|du|des|d)\b/,
  /\b(j ai|on a|il a|elle a|ils ont) (fait tomber|casse|ferme|claque|lache|renverse|allume|lance|teste|fait)\b/,
  /\bje (teste|testais|cuisine|cuisinais|bricole|bricolais|range|rangeais)\b/,
  new RegExp(`^${DET} \\w+`),
];

export function parseIntent(text: string): Intent {
  const t = normalize(text);
  if (!t) return 'no';
  if (IGNORE.some((r) => r.test(t))) return 'ignore';
  if (STOP.some((r) => r.test(t))) return 'stop';
  if (text.includes('?') || QUESTION.some((r) => r.test(t))) return 'question';
  // Avant le refus : « non, c'est la porte » donne l'origine du son.
  if (EXPLAIN.some((r) => r.test(t))) return 'explain';
  if (NO.some((r) => r.test(t))) return 'no';
  if (YES.some((r) => r.test(t)) && t.split(' ').length <= 4) return 'yes';
  return 'question';
}
