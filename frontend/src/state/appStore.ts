// État global de l'application : cycle de vie de l'écoute, modèles, classification en direct,
// calibration et score d'anomalie. Les données à haute fréquence (niveau, spectre) n'y passent
// pas : elles sont lues directement dans les boucles de dessin.

import { createStore, useStore } from 'zustand';
import {
  type CaptureErrorKind,
  type CaptureSession,
  classifyMediaError,
  startCapture,
} from '../audio/capture';
import { type DemoSession, startDemo } from '../audio/demo';
import { DEMO_AMBIENCE, DEMO_SAMPLES } from '../demo/samples';
import { ClassifierClient, type Received } from '../inference/classifierClient';
import { CALIBRATION_SECONDS, type ClassifierKind } from '../inference/config';
import type { LoadInfo } from '../inference/messages';
import { CLIP_SAMPLES, type EventRecorder } from '../events/recorder';
import { recorder as sharedRecorder, setClipSource } from './services';

export type AppStatus = 'idle' | 'consent' | 'calibrating' | 'monitoring' | 'paused' | 'error';
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export type LiveResult = Received<'result'>;
export type AnomalyReading = Received<'anomaly'>;
export type DriftReading = Received<'drift'>;

export interface AppState {
  status: AppStatus;
  /** État à retrouver après une pause. */
  resumeTo: 'calibrating' | 'monitoring';
  /** Origine du son : micro ou échantillons de démonstration. */
  source: 'mic' | 'demo' | null;
  errorKind: CaptureErrorKind | null;
  session: CaptureSession | null;
  model: { status: ModelStatus; info: LoadInfo | null; error: string | null };
  classifier: { kind: ClassifierKind; switching: boolean; error: string | null };
  calibration: { progress: number; done: boolean };
  live: LiveResult | null;
  anomaly: AnomalyReading | null;
  drift: DriftReading | null;
  /** Nombre d'alertes d'anomalie depuis la dernière calibration. */
  alerts: number;
  lastSample: { id: string; startedAt: number } | null;
  requestCapture: () => Promise<void>;
  requestDemo: () => Promise<void>;
  playSample: (id: string) => Promise<void>;
  recalibrate: () => void;
  setClassifier: (kind: ClassifierKind) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface AppDeps {
  startCapture: () => Promise<CaptureSession>;
  startDemo: () => Promise<DemoSession>;
  createClient: () => ClassifierClient;
  baseUrl: () => string;
  calibrationSeconds: number;
  recorder: Pick<
    EventRecorder,
    'startSession' | 'endSession' | 'onResult' | 'onAnomaly' | 'onDrift'
  >;
}

const defaultDeps: AppDeps = {
  startCapture: () => startCapture(),
  startDemo: () => startDemo(),
  createClient: () => new ClassifierClient(),
  baseUrl: () => new URL(import.meta.env.BASE_URL, window.location.href).toString(),
  calibrationSeconds: CALIBRATION_SECONDS,
  recorder: sharedRecorder,
};

function isDemo(session: CaptureSession | null): session is DemoSession {
  return session?.kind === 'demo';
}

const idleReadings = {
  calibration: { progress: 0, done: false },
  live: null,
  anomaly: null,
  drift: null,
  alerts: 0,
};

export function createAppStore(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = { ...defaultDeps, ...overrides };
  let client: ClassifierClient | null = null;
  let unsubscribe: (() => void)[] = [];

  return createStore<AppState>()((set, get) => {
    /** Charge les modèles une seule fois, en parallèle de la demande d'accès au micro. */
    const ensureModel = (): ClassifierClient => {
      if (client) return client;
      const created = deps.createClient();
      client = created;
      set({ model: { status: 'loading', info: null, error: null } });
      created.load(deps.baseUrl(), get().classifier.kind).then(
        (info) => {
          set({ model: { status: 'ready', info, error: null } });
          // Sans autoencodeur, pas de calibration possible : on passe directement à l'écoute.
          if (!info.anomaly && get().status === 'calibrating') set({ status: 'monitoring' });
        },
        (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          set({ model: { status: 'error', info: null, error: message } });
          if (get().status === 'calibrating') set({ status: 'monitoring' });
        },
      );
      created.on('result', (live) => {
        set({ live });
        deps.recorder.onResult(live);
      });
      created.on('calibration', ({ progress, done }) => {
        set({ calibration: { progress, done } });
        if (done && get().status === 'calibrating') set({ status: 'monitoring' });
        if (done && get().status === 'paused') set({ resumeTo: 'monitoring' });
      });
      created.on('anomaly', (anomaly) => {
        set((state) => ({ anomaly, alerts: state.alerts + (anomaly.alert ? 1 : 0) }));
        deps.recorder.onAnomaly(anomaly);
      });
      created.on('drift', (drift) => {
        set({ drift });
        deps.recorder.onDrift(drift);
      });
      return created;
    };

    const calibrate = () => {
      const c = ensureModel();
      const { model } = get();
      if (model.status === 'error' || (model.status === 'ready' && !model.info?.anomaly)) {
        // Pas d'autoencodeur : classification seule, sans calibration.
        set({ ...idleReadings, status: 'monitoring', resumeTo: 'monitoring' });
        return;
      }
      set({ ...idleReadings, status: 'calibrating', resumeTo: 'calibrating' });
      c.calibrate(deps.calibrationSeconds);
    };

    const attach = (session: CaptureSession, source: 'mic' | 'demo') => {
      const c = ensureModel();
      c.reset();
      unsubscribe = [
        session.onChunk((samples) => {
          c.push(samples);
        }),
      ];
      set({ source, session, lastSample: null });
      setClipSource(() => (session.ring.length > 0 ? session.ring.latest(CLIP_SAMPLES) : null));
      deps.recorder.startSession(source, get().classifier.kind);
      calibrate();
    };

    const detach = () => {
      unsubscribe.forEach((fn) => {
        fn();
      });
      unsubscribe = [];
    };

    const start = async (open: () => Promise<CaptureSession>, source: 'mic' | 'demo') => {
      const { status } = get();
      if (status !== 'idle' && status !== 'error') return;
      set({ status: 'consent', errorKind: null });
      ensureModel();
      try {
        const session = await open();
        attach(session, source);
        if (isDemo(session)) {
          // Fond sonore de la pièce simulée : c'est lui qui sert de ligne de base.
          await session.startAmbience(
            new URL(DEMO_AMBIENCE.file, deps.baseUrl()).toString(),
            DEMO_AMBIENCE.gainDb,
          );
        }
      } catch (error) {
        set({ status: 'error', errorKind: classifyMediaError(error), session: null });
      }
    };

    return {
      status: 'idle',
      resumeTo: 'calibrating',
      source: null,
      errorKind: null,
      session: null,
      model: { status: 'idle', info: null, error: null },
      classifier: { kind: 'yamnet', switching: false, error: null },
      ...idleReadings,
      lastSample: null,

      requestCapture: () => start(deps.startCapture, 'mic'),
      requestDemo: () => start(deps.startDemo, 'demo'),

      async playSample(id) {
        const { session, status } = get();
        const sample = DEMO_SAMPLES.find((s) => s.id === id);
        if (!isDemo(session) || !sample || (status !== 'monitoring' && status !== 'calibrating'))
          return;
        // Nouvelle lecture : on repart d'une fenêtre vide pour ne pas mélanger deux échantillons.
        client?.reset();
        const { startedAt } = await session.playSample(
          new URL(sample.file, deps.baseUrl()).toString(),
        );
        set({ lastSample: { id, startedAt } });
      },

      recalibrate() {
        const { status, session } = get();
        if (!session || (status !== 'monitoring' && status !== 'calibrating')) return;
        calibrate();
      },

      async setClassifier(kind) {
        const current = get().classifier;
        if (current.kind === kind || current.switching) return;
        if (!client) {
          set({ classifier: { kind, switching: false, error: null } });
          return;
        }
        set({ classifier: { ...current, switching: true, error: null } });
        const ok = await client.setClassifier(kind);
        set({
          classifier: ok
            ? { kind, switching: false, error: null }
            : { ...current, switching: false, error: kind },
          live: ok ? null : get().live,
        });
      },

      async pause() {
        const { status, session } = get();
        if ((status !== 'monitoring' && status !== 'calibrating') || !session) return;
        set({ status: 'paused', resumeTo: status });
        await session.pause();
      },

      async resume() {
        const { status, session, resumeTo } = get();
        if (status !== 'paused' || !session) return;
        client?.reset();
        await session.resume();
        set({ status: resumeTo });
      },

      async stop() {
        const { session } = get();
        detach();
        deps.recorder.endSession();
        setClipSource(null);
        client?.reset();
        set({
          status: 'idle',
          source: null,
          session: null,
          errorKind: null,
          lastSample: null,
          ...idleReadings,
        });
        await session?.stop();
      },
    };
  });
}

export const appStore = createAppStore();

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
