// Relie le flux d'analyse (classes, anomalie, dérive) au moteur d'événements et à la base.
// Les trames sont cadencées par le score d'anomalie (toutes les 0,5 s) ; sans autoencodeur
// ou pendant la calibration, par la classification.

import type { Received } from '../inference/classifierClient';
import type { EventStore } from './db';
import { ContextTracker } from './context';
import { EchoGuard } from './echoGuard';
import { type EngineState, type EventChange, initialEngineState, step } from './engine';
import type { Frame, SoundEvent } from './types';

export interface RecorderDeps {
  store: Pick<EventStore, 'startSession' | 'endSession' | 'saveEvent' | 'recordScore'>;
  now: () => number;
  newId: () => string;
  /** Extrait audio récent (16 kHz) pour la réécoute, gardé en mémoire vive seulement. */
  clip?: () => Float32Array | null;
  /** Échantillons envoyés à l'analyse jusqu'ici (null sans flux audio). */
  position?: () => number | null;
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
  private mutedFlag = false;
  private readonly echo = new EchoGuard();
  private readonly listeners = new Set<ChangeListener>();
  private writes: Promise<void> = Promise.resolve();
  /** Extraits audio par événement (jamais persistés). */
  readonly clips = new Map<string, Float32Array>();

  constructor(private readonly deps: RecorderDeps) {}

  get session(): string | null {
    return this.sessionId;
  }

  /** Vrai pendant que l'assistant parle (et juste après) : la détection est suspendue. */
  get muted(): boolean {
    return this.mutedFlag;
  }

  /**
   * Suspend la création d'événements pendant que la synthèse vocale parle, pour que
   * l'assistant ne se détecte pas lui-même. Avec un flux audio, ce sont les fenêtres qui
   * recouvrent la parole (et sa traîne) qui sont ignorées, quel que soit leur retard ;
   * sinon, les trames reçues pendant la sourdine.
   */
  setMuted(muted: boolean): void {
    if (muted === this.mutedFlag) return;
    this.mutedFlag = muted;
    const position = this.deps.position?.() ?? null;
    if (position === null) return;
    if (muted) this.echo.begin(position);
    else this.echo.end(position);
  }

  /** Vrai si la fenêtre qui se termine à `windowEnd` contient la voix de l'assistant. */
  isEcho(windowEnd: number): boolean {
    if ((this.deps.position?.() ?? null) === null) return this.mutedFlag;
    return this.echo.covers(windowEnd);
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
    if (this.deps.now() - this.lastAnomalyAt > ANOMALY_SILENCE_MS)
      this.frame(null, null, result.windowEndSample);
  }

  onAnomaly(anomaly: Received<'anomaly'>): void {
    this.lastAnomalyAt = this.deps.now();
    this.frame(anomaly.score, anomaly.levelDb, anomaly.windowEndSample);
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

  private frame(score: number | null, levelDb: number | null, windowEnd: number): void {
    const sessionId = this.sessionId;
    if (!sessionId) return;
    // La classification retenue peut venir d'une fenêtre voisine : elle compte aussi.
    const result = this.lastResult;
    if (this.isEcho(windowEnd) || (result && this.isEcho(result.windowEndSample))) return;
    const t = this.deps.now();
    const frame: Frame = {
      t,
      score,
      levelDb,
      dominant: this.lastResult?.dominant ?? null,
      top: this.lastResult?.top ?? [],
      drift: this.drift,
    };
    const next = step(this.state, frame, {
      sessionId,
      newId: this.deps.newId,
      context: (before) => this.context.summary(before),
    });
    this.state = next.state;
    this.context.push(frame);
    if (score !== null) {
      const second = Math.floor(t / 1_000);
      if (second !== this.lastScoreSecond) {
        this.lastScoreSecond = second;
        this.persist(() => this.deps.store.recordScore(sessionId, t, score));
      }
    }
    if (next.changes.length) this.emit(next.changes);
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
