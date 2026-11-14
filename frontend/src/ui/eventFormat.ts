import type { SoundEvent } from '../events/types';
import { t } from '../i18n';
import { familyLabel } from './labels';

const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function formatTime(ms: number): string {
  return timeFormat.format(ms);
}

export function formatDateTime(ms: number): string {
  return dateTimeFormat.format(ms);
}

export function eventLabel(event: Pick<SoundEvent, 'type' | 'family'>): string {
  if (event.type === 'drift') return t.events.drift;
  if (event.type === 'unknown' || !event.family) return t.events.unknown;
  return familyLabel(event.family);
}

/** Clé de couleur de l'événement (jeton CSS --sg-family-*). */
export function eventColorKey(event: Pick<SoundEvent, 'type' | 'family'>): string {
  if (event.type === 'drift') return 'drift';
  return event.type === 'unknown' || !event.family ? 'unknown' : event.family;
}

/** Valeur principale affichée : score d'anomalie, sinon confiance de la famille. */
export function eventValue(
  event: Pick<SoundEvent, 'scoreMax' | 'confidence' | 'type'>,
): number | null {
  if (event.type === 'known') return Math.max(event.confidence, event.scoreMax ?? 0);
  return event.scoreMax;
}

const colorCache = new Map<string, string>();

/** Couleur lue dans les jetons CSS (mise en cache : appelée dans les boucles de dessin). */
export function familyColor(key: string): string {
  let color = colorCache.get(key);
  if (!color) {
    color =
      getComputedStyle(document.documentElement).getPropertyValue(`--sg-family-${key}`).trim() ||
      '#a2b1bf';
    colorCache.set(key, color);
  }
  return color;
}
