import { describe, expect, it, vi } from 'vitest';
import { CaptureError, type CaptureSession, type ChunkListener } from '../audio/capture';
import type { DemoSession } from '../audio/demo';
import { DEMO_SAMPLES } from '../demo/samples';
import type { ClassifierClient, ResultListener } from '../inference/classifierClient';
import { type AppDeps, createAppStore } from './appStore';

function fakeSession<K extends 'mic' | 'demo'>(kind: K) {
  let chunkListener: ChunkListener | null = null;
  const spies = {
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    playSample: vi.fn(() => Promise.resolve({ startedAt: 100, duration: 2 })),
  };
  const session = {
    kind,
    analyser: {} as AnalyserNode,
    inputSampleRate: 48_000,
    ring: {} as CaptureSession['ring'],
    onChunk: (l: ChunkListener) => {
      chunkListener = l;
      return () => {
        chunkListener = null;
      };
    },
    ...spies,
  };
  return { session, spies, emitChunk: (s: Float32Array) => chunkListener?.(s) };
}

function fakeClient() {
  let resultListener: ResultListener | null = null;
  const spies = {
    load: vi.fn(() => Promise.resolve({ loadMs: 5, fromCache: false, modelBytes: 10 })),
    push: vi.fn(),
    reset: vi.fn(),
  };
  const client = {
    ...spies,
    onResult: (l: ResultListener) => {
      resultListener = l;
      return () => {
        resultListener = null;
      };
    },
    dispose: vi.fn(),
  } as unknown as ClassifierClient;
  return { client, spies, emit: (r: Parameters<ResultListener>[0]) => resultListener?.(r) };
}

function makeStore(overrides: Partial<AppDeps> = {}) {
  const c = fakeClient();
  const store = createAppStore({
    createClient: () => c.client,
    baseUrl: () => 'http://localhost/',
    startCapture: () => Promise.resolve(fakeSession('mic').session),
    startDemo: () => Promise.resolve(fakeSession('demo').session as unknown as DemoSession),
    ...overrides,
  });
  return { store, client: c };
}

describe('appStore', () => {
  it('démarre à l’arrêt, sans charger le modèle', () => {
    const { store, client } = makeStore();
    expect(store.getState().status).toBe('idle');
    expect(client.spies.load).not.toHaveBeenCalled();
  });

  it('passe par la demande d’autorisation puis l’écoute, en chargeant le modèle', async () => {
    let resolve: (s: CaptureSession) => void = () => undefined;
    const { store, client } = makeStore({ startCapture: () => new Promise((r) => (resolve = r)) });
    const pending = store.getState().requestCapture();
    expect(store.getState().status).toBe('consent');
    expect(client.spies.load).toHaveBeenCalledWith('http://localhost/');
    resolve(fakeSession('mic').session);
    await pending;
    expect(store.getState()).toMatchObject({ status: 'monitoring', source: 'mic' });
    expect(store.getState().model.status).toBe('ready');
  });

  it('envoie les blocs au classifieur et publie le résultat en direct', async () => {
    const mic = fakeSession('mic');
    const { store, client } = makeStore({ startCapture: () => Promise.resolve(mic.session) });
    await store.getState().requestCapture();
    const chunk = new Float32Array(1_600);
    mic.emitChunk(chunk);
    expect(client.spies.push).toHaveBeenCalledWith(chunk);
    const result = {
      top: [],
      families: [],
      dominant: null,
      windowEndSample: 15_600,
      inferenceMs: 4,
      receivedAt: 9,
    };
    client.emit(result);
    expect(store.getState().live).toEqual(result);
  });

  it('enregistre l’échec du chargement du modèle sans bloquer l’écoute', async () => {
    const c = fakeClient();
    c.spies.load.mockRejectedValueOnce(new Error('réseau'));
    const store = createAppStore({
      createClient: () => c.client,
      baseUrl: () => 'http://localhost/',
      startCapture: () => Promise.resolve(fakeSession('mic').session),
    });
    await store.getState().requestCapture();
    await Promise.resolve();
    expect(store.getState().status).toBe('monitoring');
    expect(store.getState().model).toMatchObject({ status: 'error', error: 'réseau' });
  });

  it('enregistre la cause d’un refus et permet de réessayer', async () => {
    const start = vi
      .fn<() => Promise<CaptureSession>>()
      .mockRejectedValueOnce(new CaptureError('denied'))
      .mockResolvedValueOnce(fakeSession('mic').session);
    const { store } = makeStore({ startCapture: start });
    await store.getState().requestCapture();
    expect(store.getState()).toMatchObject({ status: 'error', errorKind: 'denied' });
    await store.getState().requestCapture();
    expect(store.getState()).toMatchObject({ status: 'monitoring', errorKind: null });
  });

  it('lance le mode démonstration sans micro et joue un échantillon', async () => {
    const demo = fakeSession('demo');
    const startCaptureSpy = vi.fn();
    const { store, client } = makeStore({
      startDemo: () => Promise.resolve(demo.session as unknown as DemoSession),
      startCapture: startCaptureSpy,
    });
    await store.getState().requestDemo();
    expect(store.getState()).toMatchObject({ status: 'monitoring', source: 'demo' });
    expect(startCaptureSpy).not.toHaveBeenCalled();

    const sample = DEMO_SAMPLES[0];
    if (!sample) throw new Error('aucun échantillon');
    client.spies.reset.mockClear();
    await store.getState().playSample(sample.id);
    expect(client.spies.reset).toHaveBeenCalled();
    expect(demo.spies.playSample).toHaveBeenCalledWith(`http://localhost/${sample.file}`);
    expect(store.getState().lastSample).toEqual({ id: sample.id, startedAt: 100 });
  });

  it('ignore la lecture d’un échantillon hors du mode démonstration', async () => {
    const mic = fakeSession('mic');
    const { store } = makeStore({ startCapture: () => Promise.resolve(mic.session) });
    await store.getState().requestCapture();
    await store.getState().playSample('alarm-smoke');
    expect(store.getState().lastSample).toBeNull();
  });

  it('ignore une deuxième demande pendant l’écoute', async () => {
    const start = vi.fn(() => Promise.resolve(fakeSession('mic').session));
    const { store } = makeStore({ startCapture: start });
    await store.getState().requestCapture();
    await store.getState().requestCapture();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('met en pause, reprend et arrête la session', async () => {
    const mic = fakeSession('mic');
    const { store, client } = makeStore({ startCapture: () => Promise.resolve(mic.session) });
    await store.getState().requestCapture();

    await store.getState().pause();
    expect(store.getState().status).toBe('paused');
    expect(mic.spies.pause).toHaveBeenCalled();

    await store.getState().resume();
    expect(store.getState().status).toBe('monitoring');
    expect(client.spies.reset).toHaveBeenCalled();

    await store.getState().stop();
    expect(store.getState()).toMatchObject({
      status: 'idle',
      session: null,
      source: null,
      live: null,
    });
    expect(mic.spies.stop).toHaveBeenCalled();
    // Après l'arrêt, les blocs ne vont plus au classifieur.
    client.spies.push.mockClear();
    mic.emitChunk(new Float32Array(4));
    expect(client.spies.push).not.toHaveBeenCalled();
  });
});
