// État global de l'application : cycle de vie de l'écoute.
// Les données à haute fréquence (niveau, spectre) n'y passent pas : elles sont lues
// directement dans les boucles de dessin pour éviter des rendus React inutiles.

import { createStore, useStore } from 'zustand';
import {
  type CaptureErrorKind,
  type CaptureSession,
  classifyMediaError,
  startCapture,
} from '../audio/capture';

export type AppStatus = 'idle' | 'consent' | 'monitoring' | 'paused' | 'error';

export interface AppState {
  status: AppStatus;
  errorKind: CaptureErrorKind | null;
  session: CaptureSession | null;
  requestCapture: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

export type StartCapture = () => Promise<CaptureSession>;

export function createAppStore(start: StartCapture = () => startCapture()) {
  return createStore<AppState>()((set, get) => ({
    status: 'idle',
    errorKind: null,
    session: null,

    async requestCapture() {
      const { status } = get();
      if (status !== 'idle' && status !== 'error') return;
      set({ status: 'consent', errorKind: null });
      try {
        const session = await start();
        set({ status: 'monitoring', session });
      } catch (error) {
        set({ status: 'error', errorKind: classifyMediaError(error), session: null });
      }
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
      await session.resume();
      set({ status: 'monitoring' });
    },

    async stop() {
      const { session } = get();
      set({ status: 'idle', session: null, errorKind: null });
      await session?.stop();
    },
  }));
}

export const appStore = createAppStore();

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useStore(appStore, selector);
}
