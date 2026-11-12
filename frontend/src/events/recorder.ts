// Relie le flux d'analyse (classes, anomalie, dérive) au moteur d'événements et à la base.
// Les trames sont cadencées par le score d'anomalie (toutes les 0,5 s) ; sans autoencodeur
// ou pendant la calibration, par la classification.

import type { Received } from '../inference/classifierClient';
import type { EventStore } from './db';
import { ContextTracker } from './context';
import { type EngineState, type EventChange, initialEngineState, step } from './engine';
import type { Frame, SoundEvent } from './types';

export interface RecorderDeps {
  store: Pick<EventStore, 'startSession' | 'endSession' | 'saveEvent' | 'recordScore'>;
  now: () => number;
  newId: () => string;
  /** Extrait audio récent (16 kHz) pour la réécoute, gardé en mémoire vive seulement. */
  clip?: () => Float32Array | null;
}

export type ChangeListener = (changes: EventChange[]) => void;

/** Au-delà, on considère que le score d'anomalie ne cadence plus les trames. */
const ANOMALY_SILENCE_MS = 1_500;
export const CLIP_SAMPLES = 3 * 16_000;

export class EventRecorder {
  private sessionId: string | null = null;
  private state: EngineState = initialEngineState;
  private readonly context = new ContextTracker();
  private lastResult: Received<'result'> | null = null;
  private drift = false;
  private lastAnomalyAt = Number.NEGATIVE_INFINITY;
  private lastScoreSecond = -1;
  private readonly listeners = new Set<ChangeListener>();
  private writes: Promise<void> = Promise.resolve();
  /** Extraits audio par événement (jamais persistés). */
  readonly clips = new Map<string, Float32Array>();

  constructor(private readonly deps: RecorderDeps) {}

  get session(): string | null {
    return this.sessionId;
  }

  startSession(source: 'mic' | 'demo', classifier: string): string {
    const id = this.deps.newId();
    this.sessionId = id;
    this.state = initialEngineState;
    this.context.reset();
    this.lastResult = null;
    this.drift = false;
    this.persist(() =>
      this.deps.store.startSession({
        id,
        startedAt: this.deps.now(),
        endedAt: null,
        source,
        classifier,
      }),
    );
    return id;
  }

  endSession(): void {
    const id = this.sessionId;
    if (!id) return;
    const open = this.state.open;
    if (open) this.emit([{ kind: 'closed', event: { ...open, closed: true } }]);
    this.persist(() => this.deps.store.endSession(id, this.deps.now()));
    this.sessionId = null;
    this.state = initialEngineState;
  }

  onResult(result: Received<'result'>): void {
    this.lastResult = result;
    if (this.deps.now() - this.lastAnomalyAt > ANOMALY_SILENCE_MS) this.frame(null, null);
  }

  onAnomaly(anomaly: Received<'anomaly'>): void {
    this.lastAnomalyAt = this.deps.now();
    this.frame(anomaly.score, anomaly.levelDb);
  }

  onDrift(drift: Received<'drift'>): void {
    this.drift = drift.sustained;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Attend la fin des écritures en cours (tests, export). */
  flush(): Promise<void> {
    return this.writes;
  }

  private frame(score: number | null, levelDb: number | null): void {
    const sessionId = this.sessionId;
    if (!sessionId) return;
    const t = this.deps.now();
    const frame: Frame = {
      t,
      score,
      levelDb,
      dominant: this.lastResult?.dominant ?? null,
      top: this.lastResult?.top ?? [],
      drift: this.drift,
    };
    const result = step(this.state, frame, {
      sessionId,
      newId: this.deps.newId,
      context: (before) => this.context.summary(before),
    });
    this.state = result.state;
    this.context.push(frame);
    if (score !== null) {
      const second = Math.floor(t / 1_000);
      if (second !== this.lastScoreSecond) {
        this.lastScoreSecond = second;
        this.persist(() => this.deps.store.recordScore(sessionId, t, score));
      }
    }
    if (result.changes.length) this.emit(result.changes);
  }

  private emit(changes: EventChange[]): void {
    for (const change of changes) {
      if (change.kind === 'closed' && change.event.type !== 'drift') {
        const clip = this.deps.clip?.();
        if (clip) this.clips.set(change.event.id, clip);
      }
      const event: SoundEvent = change.event;
      this.persist(() => this.deps.store.saveEvent(event));
    }
    this.listeners.forEach((l) => {
      l(changes);
    });
  }

  private persist(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((error: unknown) => {
      console.warn('Écriture de l’historique impossible', error);
    });
  }
}
