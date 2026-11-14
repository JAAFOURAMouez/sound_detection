// Géométrie des échos du radar (pure).

import type { SoundEvent } from '../../events/types';
import { eventValue } from '../eventFormat';
import { RADAR_PERIOD_SECONDS } from './config';
import { angleForTime, polarToCanvas } from './radarGeometry';

export const ECHO_PERIOD_MS = RADAR_PERIOD_SECONDS * 1_000;

/** Position, taille et opacité d'un écho ; null s'il a disparu (plus d'une minute). */
export function echoGeometry(
  event: Pick<SoundEvent, 'start' | 'end' | 'severity' | 'scoreMax' | 'confidence' | 'type'>,
  now: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number; r: number; alpha: number } | null {
  const age = now - event.end;
  if (age > ECHO_PERIOD_MS || event.start > now) return null;
  const value = event.type === 'drift' ? 0.15 : (eventValue(event) ?? 0.3);
  const angle = angleForTime(event.start / 1_000, RADAR_PERIOD_SECONDS);
  const { x, y } = polarToCanvas(cx, cy, Math.max(0.08, Math.min(1, value)) * radius, angle);
  return { x, y, r: 3 + event.severity * 3, alpha: Math.max(0.15, 1 - age / ECHO_PERIOD_MS) };
}

/** Durée de la pulsation qui signale l'arrivée d'un événement. */
export const PULSE_MS = 1_200;

/**
 * Pulsation d'apparition : un anneau qui s'élargit et s'efface (pulsation = événement).
 * Renvoie l'écart au rayon de l'écho et l'opacité, ou null hors de la fenêtre.
 */
export function pulseRing(ageMs: number): { spread: number; alpha: number } | null {
  if (ageMs < 0 || ageMs >= PULSE_MS) return null;
  const p = ageMs / PULSE_MS;
  // Sortie rapide puis ralentie (ease-out), extinction linéaire.
  return { spread: 28 * (1 - (1 - p) ** 3), alpha: 0.8 * (1 - p) };
}
