// Modèle des événements sonores (voir docs/ARCHITECTURE.md, « Moteur d'événements »).

import type { RankedClass, Severity } from '../inference/families';

export type EventType = 'known' | 'unknown' | 'drift';
export type DialogStatus = 'none' | 'asked' | 'answered' | 'dismissed';

export interface MinuteContext {
  /** Familles dominantes de la minute précédente, par part de fenêtres décroissante. */
  families: { family: string; share: number }[];
  meanLevelDb: number | null;
  /** Écart-type du niveau : faible = ambiance stable. */
  levelStdDb: number | null;
  frames: number;
}

export interface SoundEvent {
  id: string;
  sessionId: string;
  /** Horodatages en millisecondes (epoch). */
  start: number;
  end: number;
  type: EventType;
  /** Famille reconnue (événements `known`), null sinon. */
  family: string | null;
  severity: Severity;
  /** Top-k au moment de la plus forte confiance. */
  topK: RankedClass[];
  /** Score d'anomalie maximal (0 à 1), null sans autoencodeur. */
  scoreMax: number | null;
  /** Confiance maximale de la famille reconnue. */
  confidence: number;
  levelDbMax: number | null;
  context: MinuteContext;
  closed: boolean;
  dialogStatus: DialogStatus;
  note: string;
}

/** Observation agrégée toutes les 0,5 s. */
export interface Frame {
  t: number;
  /** Score d'anomalie lissé, null si l'autoencodeur est indisponible ou non calibré. */
  score: number | null;
  levelDb: number | null;
  dominant: { family: string; score: number; severity: Severity } | null;
  top: RankedClass[];
  /** Dérive maintenue (DriftMonitor). */
  drift: boolean;
}
