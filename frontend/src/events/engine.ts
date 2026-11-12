// Moteur d'événements pur : step(state, frame) → { state, changes }.
// Hystérésis à l'ouverture et à la fermeture, fusion des événements proches, types
// `known` (famille critique reconnue), `unknown` (anomalie sans classe fiable) et `drift`.

import type { Severity } from '../inference/families';
import type { Frame, MinuteContext, SoundEvent } from './types';

export interface EventEngineConfig {
  /** Score d'anomalie (lissé) qui ouvre un événement. */
  openScore: number;
  /** Score sous lequel une trame compte comme calme. */
  closeScore: number;
  /** Trames calmes consécutives pour clore. */
  closeFrames: number;
  /** Gravité minimale d'une famille pour ouvrir un événement `known` sans anomalie. */
  knownSeverity: Severity;
  /** Confiance minimale de cette famille. */
  knownConfidence: number;
  /** Deux événements séparés de moins que cela fusionnent (ms). */
  mergeGapMs: number;
  /** Gravité d'un événement `unknown` (vérification). */
  unknownSeverity: Severity;
}

export const DEFAULT_EVENT_CONFIG: EventEngineConfig = {
  openScore: 0.5,
  closeScore: 0.4,
  closeFrames: 2,
  knownSeverity: 2,
  knownConfidence: 0.5,
  mergeGapMs: 2_000,
  unknownSeverity: 1,
};

export interface EngineState {
  open: SoundEvent | null;
  calmFrames: number;
  lastClosed: SoundEvent | null;
  driftActive: boolean;
}

export type EventChange = { kind: 'opened' | 'updated' | 'closed'; event: SoundEvent };

export const initialEngineState: EngineState = {
  open: null,
  calmFrames: 0,
  lastClosed: null,
  driftActive: false,
};

export interface StepDeps {
  sessionId: string;
  newId: () => string;
  /** Contexte de la minute qui précède l'instant donné. */
  context: (before: number) => MinuteContext;
  config?: EventEngineConfig;
}

function knownTrigger(frame: Frame, cfg: EventEngineConfig) {
  const d = frame.dominant;
  return d && d.severity >= cfg.knownSeverity && d.score >= cfg.knownConfidence ? d : null;
}

function absorb(event: SoundEvent, frame: Frame, cfg: EventEngineConfig): SoundEvent {
  const known = knownTrigger(frame, cfg);
  const next: SoundEvent = {
    ...event,
    end: frame.t,
    scoreMax: frame.score === null ? event.scoreMax : Math.max(event.scoreMax ?? 0, frame.score),
    levelDbMax:
      frame.levelDb === null
        ? event.levelDbMax
        : Math.max(event.levelDbMax ?? -Infinity, frame.levelDb),
  };
  if (
    known &&
    (next.type === 'unknown' || known.score > next.confidence || known.severity > next.severity)
  ) {
    // Une famille critique reconnue fait d'un événement inconnu un événement connu.
    next.type = 'known';
    next.family = known.family;
    next.severity = Math.max(next.severity, known.severity) as Severity;
    next.confidence = Math.max(next.confidence, known.score);
    next.topK = frame.top;
  }
  return next;
}

export function step(
  state: EngineState,
  frame: Frame,
  deps: StepDeps,
): { state: EngineState; changes: EventChange[] } {
  const cfg = deps.config ?? DEFAULT_EVENT_CONFIG;
  const changes: EventChange[] = [];
  let next: EngineState = { ...state };

  // Dérive : événement instantané au début d'un épisode, gravité 0.
  if (frame.drift && !state.driftActive) {
    const drift: SoundEvent = {
      id: deps.newId(),
      sessionId: deps.sessionId,
      start: frame.t,
      end: frame.t,
      type: 'drift',
      family: null,
      severity: 0,
      topK: frame.top,
      scoreMax: frame.score,
      confidence: 0,
      levelDbMax: frame.levelDb,
      context: deps.context(frame.t),
      closed: true,
      dialogStatus: 'none',
      note: '',
    };
    changes.push({ kind: 'opened', event: drift }, { kind: 'closed', event: drift });
  }
  next.driftActive = frame.drift;

  const known = knownTrigger(frame, cfg);
  const anomalous = frame.score !== null && frame.score >= cfg.openScore;
  const active = known !== null || anomalous;
  const calm = known === null && (frame.score === null || frame.score < cfg.closeScore);

  if (state.open) {
    if (active) {
      next.open = absorb(state.open, frame, cfg);
      next.calmFrames = 0;
      changes.push({ kind: 'updated', event: next.open });
    } else if (calm) {
      next.calmFrames = state.calmFrames + 1;
      if (next.calmFrames >= cfg.closeFrames) {
        const closed = { ...state.open, closed: true };
        changes.push({ kind: 'closed', event: closed });
        next = { ...next, open: null, calmFrames: 0, lastClosed: closed };
      }
    } else {
      // Entre les deux seuils : on maintient l'événement ouvert (hystérésis).
      next.calmFrames = 0;
    }
    return { state: next, changes };
  }

  if (!active) return { state: next, changes };

  const last = state.lastClosed;
  if (last && frame.t - last.end <= cfg.mergeGapMs) {
    // Fusion : on rouvre l'événement précédent.
    next.open = absorb({ ...last, closed: false }, frame, cfg);
    next.lastClosed = null;
    changes.push({ kind: 'updated', event: next.open });
    return { state: next, changes };
  }

  const opened: SoundEvent = absorb(
    {
      id: deps.newId(),
      sessionId: deps.sessionId,
      start: frame.t,
      end: frame.t,
      type: 'unknown',
      family: null,
      severity: cfg.unknownSeverity,
      topK: frame.top,
      scoreMax: frame.score,
      confidence: 0,
      levelDbMax: frame.levelDb,
      context: deps.context(frame.t),
      closed: false,
      dialogStatus: 'none',
      note: '',
    },
    frame,
    cfg,
  );
  next.open = opened;
  next.calmFrames = 0;
  changes.push({ kind: 'opened', event: opened });
  return { state: next, changes };
}
