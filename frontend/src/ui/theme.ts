// Thème d'affichage : sombre par défaut, clair « papier millimétré » en option.
// Le choix est mémorisé dans ce navigateur (confort personnel, sans conséquence s'il se perd).

import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'sg-theme';
const listeners = new Set<() => void>();
let current: Theme = 'dark';

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function currentTheme(): Theme {
  return current;
}

/** Applique le thème au document ; les canvas relisent leurs couleurs au changement. */
export function applyTheme(theme: Theme, { persist = true } = {}): void {
  current = theme;
  if (theme === 'light') document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour cette page seulement.
    }
  }
  for (const listener of listeners) listener();
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, currentTheme, () => 'dark');
}
