// État global de l'application : cycle de vie de l'écoute, modèle et classification en direct.
// Les données à haute fréquence (niveau, spectre) n'y passent pas : elles sont lues
// directement dans les boucles de dessin pour éviter des rendus React inutiles.

import { createStore, useStore } from 'zustand';
import {
  type CaptureErrorKind,
  type CaptureSession,
  classifyMediaError,
  startCapture,
} from '../audio/capture';
import { type DemoSession, startDemo } from '../audio/demo';
import { DEMO_SAMPLES } from '../demo/samples';
import { ClassifierClient, type ResultListener } from '../inference/classifierClient';
import type { LoadInfo } from '../inference/messages';

export type AppStatus = 'idle' | 'consent' | 'monitoring' | 'paused' | 'error';
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';
export type LiveResult = Parameters<ResultListener>[0];

export interface AppState {
  status: AppStatus;
  /** Origine du son : micro ou échantillons de démonstration. */
  source: 'mic' | 'demo' | null;
  errorKind: CaptureErrorKind | null;
  session: CaptureSession | null;
  model: { status: ModelStatus; info: LoadInfo | null; error: string | null };
  live: LiveResult | null;
  lastSample: { id: string; startedAt: number } | null;
  requestCapture: () => Promise<void>;
  requestDemo: () => Promise<void>;
  playSample: (id: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface AppDeps {
  startCapture: () => Promise<CaptureSession>;
  startDemo: () => Promise<DemoSession>;
  createClient: () => ClassifierClient;
  baseUrl: () => string;
}

const defaultDeps: AppDeps = {
  startCapture: () => startCapture(),
  startDemo: () => startDemo(),
  createClient: () => new ClassifierClient(),
  baseUrl: () => new URL(import.meta.env.BASE_URL, window.location.href).toString(),
};

function isDemo(session: CaptureSession | null): session is DemoSession {
  return session?.kind === 'demo';
}

export function createAppStore(overrides: Partial<AppDeps> = {}) {
  const deps: AppDeps = { ...defaultDeps, ...overrides };
  let client: ClassifierClient | null = null;
  let unsubscribe: (() => void)[] = [];

  return createStore<AppState>()((set, get) => {
    /** Charge le modèle une seule fois, en parallèle de la demande d'accès au micro. */
    const ensureModel = (): ClassifierClient => {
      if (client) return client;
      const created = deps.createClient();
      client = created;
      set({ model: { status: 'loading', info: null, error: null } });
      created.load(deps.baseUrl()).then(
        (info) => {
          set({ model: { status: 'ready', info, error: null } });
        },
        (error: unknown) => {
          set({
            model: {
              status: 'error',
              info: null,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        },
      );
      return created;
    };

    const attach = (session: CaptureSession, source: 'mic' | 'demo') => {
      const c = ensureModel();
      c.reset();
      unsubscribe = [
        session.onChunk((samples) => {
          c.push(samples);
        }),
        c.onResult((result) => {
          set({ live: result });
        }),
      ];
      set({ status: 'monitoring', source, session, live: null });
    };

    const detach = () => {
      unsubscribe.forEach((fn) => {
        fn();
      });
      unsubscribe = [];
    };

    return {
      status: 'idle',
      source: null,
      errorKind: null,
      session: null,
      model: { status: 'idle', info: null, error: null },
      live: null,
      lastSample: null,

      async requestCapture() {
        const { status } = get();
        if (status !== 'idle' && status !== 'error') return;
        set({ status: 'consent', errorKind: null });
        ensureModel();
        try {
          attach(await deps.startCapture(), 'mic');
        } catch (error) {
          set({ status: 'error', errorKind: classifyMediaError(error), session: null });
        }
      },

      async requestDemo() {
        const { status } = get();
        if (status !== 'idle' && status !== 'error') return;
        set({ status: 'consent', errorKind: null });
        ensureModel();
        try {
          attach(await deps.startDemo(), 'demo');
        } catch (error) {
          set({ status: 'error', errorKind: classifyMediaError(error), session: null });
        }
      },

      async playSample(id) {
        const { session, status } = get();
        const sample = DEMO_SAMPLES.find((s) => s.id === id);
        if (!isDemo(session) || !sample || status !== 'monitoring') return;
        // Nouvelle lecture : on repart d'une fenêtre vide pour ne pas mélanger deux échantillons.
        client?.reset();
        const { startedAt } = await session.playSample(
          new URL(sample.file, deps.baseUrl()).toString(),
        );
        set({ lastSample: { id, startedAt } });
      },

      async pause() {
        const { status, session } = get();
        if (status !== 'monitoring' || !session) return;
        set({ status: 'paused' });
        await session.pause();
      },

      async resume() {
        const { status, session } = get();
        if (status !== 'paused' || !session) return;
        client?.reset();
        await session.resume();
        set({ status: 'monitoring' });
      },

      async stop() {
        const { session } = get();
        detach();
        client?.reset();
        set({
          status: 'idle',
          source: null,
          session: null,
          errorKind: null,
          live: null,
          lastSample: null,
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
