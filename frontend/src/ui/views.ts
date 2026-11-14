import type { View } from '../state/historyStore';

/** Adresse de chaque vue : la navigation passe par le fragment d'URL. */
export const VIEW_HASH: Record<View, string> = {
  listen: '',
  history: 'historique',
  about: 'a-propos',
};

export function viewFromHash(hash: string): View {
  const key = hash.replace(/^#/, '');
  return (
    (Object.entries(VIEW_HASH) as [View, string][]).find(([, h]) => h !== '' && h === key)?.[0] ??
    'listen'
  );
}
