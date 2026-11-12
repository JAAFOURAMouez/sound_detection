import { describe, expect, it, vi } from 'vitest';
import { CaptureError, type CaptureSession, type ChunkListener } from '../audio/capture';
import type { DemoSession } from '../audio/demo';
import { DEMO_AMBIENCE, DEMO_SAMPLES } from '../demo/samples';
import type { ClassifierClient } from '../inference/classifierClient';
import type { LoadInfo } from '../inference/messages';
import { type AppDeps, createAppStore } from './appStore';

function fakeSession<K extends 'mic' | 'demo'>(kind: K) {
  let chunkListener: ChunkListener | null = null;
  const spies = {
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
    playSample: vi.fn(() => Promise.resolve({ startedAt: 100, duration: 2 })),
    startAmbience: vi.fn(() => Promise.resolve()),
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

const loaded: LoadInfo = { loadMs: 5, fromCache: false, modelBytes: 10, anomaly: true };

function fakeClient() {
  const listeners = new Map<string, (e: unknown) => void>();
  const spies = {
    load: vi.fn((_url: string, _kind?: string) => Promise.resolve(loaded)),
    push: vi.fn(),
    reset: vi.fn(),
    calibrate: vi.fn(),
    setClassifier: vi.fn(() => Promise.resolve(true)),
  };
  const client = {
    ...spies,
    on: (type: string, l: (e: unknown) => void) => {
      listeners.set(type, l);
      return () => listeners.delete(type);
    },
    dispose: vi.fn(),
  } as unknown as ClassifierClient;
  const emit = (type: string, payload: object) =>
    listeners.get(type)?.({ receivedAt: 1, ...payload });
  return { client, spies, emit };
}

const anomaly = (score: number, alert = false) => ({
  windowEndSample: 0,
  raw: score,
  score,
  zReconstruction: 0,
  zEmbedding: 0,
  levelDb: -40,
  above: score >= 0.5,
  alert,
});

function fakeRecorder() {
  return {
    startSession: vi.fn(() => 'session'),
    endSession: vi.fn(),
    onResult: vi.fn(),
    onAnomaly: vi.fn(),
    onDrift: vi.fn(),
  };
}

function makeStore(overrides: Partial<AppDeps> = {}, c = fakeClient(), recorder = fakeRecorder()) {
  const store = createAppStore({
    recorder,
    createClient: () => c.client,
    baseUrl: () => 'http://localhost/',
    startCapture: () => Promise.resolve(fakeSession('mic').session),
    startDemo: () => Promise.resolve(fakeSession('demo').session as unknown as DemoSession),
    calibrationSeconds: 30,
    ...overrides,
  });
  return { store, client: c, recorder };
}

describe('appStore', () => {
  it('démarre à l’arrêt, sans charger les modèles', () => {
    const { store, client } = makeStore();
    expect(store.getState().status).toBe('idle');
    expect(client.spies.load).not.toHaveBeenCalled();
  });

  it('demande l’autorisation, charge les modèles puis calibre avant d’écouter', async () => {
    let resolve: (s: CaptureSession) => void = () => undefined;
    const { store, client } = makeStore({ startCapture: () => new Promise((r) => (resolve = r)) });
    const pending = store.getState().requestCapture();
    expect(store.getState().status).toBe('consent');
    expect(client.spies.load).toHaveBeenCalledWith('http://localhost/', 'yamnet');
    resolve(fakeSession('mic').session);
    await pending;
    expect(store.getState()).toMatchObject({ status: 'calibrating', source: 'mic' });
    expect(client.spies.calibrate).toHaveBeenCalledWith(30);

    client.emit('calibration', { progress: 0.5, done: false });
    expect(store.getState().calibration.progress).toBe(0.5);
    client.emit('calibration', { progress: 1, done: true });
    expect(store.getState().status).toBe('monitoring');
  });

  it('envoie les blocs au worker et publie classes, score d’anomalie et alertes', async () => {
    const mic = fakeSession('mic');
    const { store, client } = makeStore({ startCapture: () => Promise.resolve(mic.session) });
    await store.getState().requestCapture();
    const chunk = new Float32Array(1_600);
    mic.emitChunk(chunk);
    expect(client.spies.push).toHaveBeenCalledWith(chunk);

    client.emit('result', {
      model: 'yamnet',
      top: [],
      families: [],
      dominant: null,
      windowEndSample: 1,
      inferenceMs: 2,
    });
    expect(store.getState().live?.model).toBe('yamnet');
    client.emit('anomaly', anomaly(0.2));
    client.emit('anomaly', anomaly(0.7, true));
    client.emit('anomaly', anomaly(0.8));
    expect(store.getState().anomaly?.score).toBe(0.8);
    expect(store.getState().alerts).toBe(1);
  });

  it('passe à l’écoute sans calibration si l’autoencodeur manque', async () => {
    const c = fakeClient();
    c.spies.load.mockResolvedValueOnce({ ...loaded, anomaly: false });
    const { store } = makeStore({}, c);
    await store.getState().requestCapture();
    await Promise.resolve();
    expect(store.getState().status).toBe('monitoring');
  });

  it('enregistre l’échec du chargement des modèles sans bloquer l’écoute', async () => {
    const c = fakeClient();
    c.spies.load.mockRejectedValueOnce(new Error('réseau'));
    const { store } = makeStore({}, c);
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
    expect(store.getState()).toMatchObject({ status: 'calibrating', errorKind: null });
  });

  it('lance la démo sans micro, avec l’ambiance en fond, et joue un échantillon', async () => {
    const demo = fakeSession('demo');
    const startCaptureSpy = vi.fn();
    const { store, client } = makeStore({
      startDemo: () => Promise.resolve(demo.session as unknown as DemoSession),
      startCapture: startCaptureSpy,
    });
    await store.getState().requestDemo();
    expect(store.getState()).toMatchObject({ status: 'calibrating', source: 'demo' });
    expect(startCaptureSpy).not.toHaveBeenCalled();
    expect(demo.spies.startAmbience).toHaveBeenCalledWith(
      `http://localhost/${DEMO_AMBIENCE.file}`,
      DEMO_AMBIENCE.gainDb,
    );

    client.emit('calibration', { progress: 1, done: true });
    const sample = DEMO_SAMPLES[0];
    if (!sample) throw new Error('aucun échantillon');
    client.spies.reset.mockClear();
    await store.getState().playSample(sample.id);
    expect(client.spies.reset).toHaveBeenCalled();
    expect(demo.spies.playSample).toHaveBeenCalledWith(`http://localhost/${sample.file}`);
    expect(store.getState().lastSample).toEqual({ id: sample.id, startedAt: 100 });
  });

  it('recalibre à la demande en remettant les mesures à zéro', async () => {
    const { store, client } = makeStore();
    await store.getState().requestCapture();
    client.emit('calibration', { progress: 1, done: true });
    client.emit('anomaly', anomaly(0.9, true));
    store.getState().recalibrate();
    expect(store.getState()).toMatchObject({ status: 'calibrating', alerts: 0, anomaly: null });
    expect(client.spies.calibrate).toHaveBeenCalledTimes(2);
  });

  it('change de classifieur et signale un échec', async () => {
    const { store, client } = makeStore();
    await store.getState().requestCapture();
    await store.getState().setClassifier('cnn');
    expect(client.spies.setClassifier).toHaveBeenCalledWith('cnn');
    expect(store.getState().classifier).toEqual({ kind: 'cnn', switching: false, error: null });

    client.spies.setClassifier.mockResolvedValueOnce(false);
    await store.getState().setClassifier('yamnet');
    expect(store.getState().classifier).toMatchObject({ kind: 'cnn', error: 'yamnet' });
  });

  it('met en pause pendant la calibration et y revient à la reprise', async () => {
    const mic = fakeSession('mic');
    const { store, client } = makeStore({ startCapture: () => Promise.resolve(mic.session) });
    await store.getState().requestCapture();
    await store.getState().pause();
    expect(store.getState()).toMatchObject({ status: 'paused', resumeTo: 'calibrating' });
    await store.getState().resume();
    expect(store.getState().status).toBe('calibrating');
    expect(client.spies.reset).toHaveBeenCalled();
  });

  it('arrête la session et coupe le flux vers le worker', async () => {
    const mic = fakeSession('mic');
    const { store, client } = makeStore({ startCapture: () => Promise.resolve(mic.session) });
    await store.getState().requestCapture();
    await store.getState().stop();
    expect(store.getState()).toMatchObject({
      status: 'idle',
      session: null,
      source: null,
      live: null,
    });
    expect(mic.spies.stop).toHaveBeenCalled();
    client.spies.push.mockClear();
    mic.emitChunk(new Float32Array(4));
    expect(client.spies.push).not.toHaveBeenCalled();
  });
});

describe('appStore et historique', () => {
  it('ouvre une session d’événements, lui transmet le flux et la ferme à l’arrêt', async () => {
    const { store, client, recorder } = makeStore();
    await store.getState().requestDemo();
    expect(recorder.startSession).toHaveBeenCalledWith('demo', 'yamnet');
    client.emit('anomaly', anomaly(0.7, true));
    client.emit('result', {
      model: 'yamnet',
      top: [],
      families: [],
      dominant: null,
      windowEndSample: 1,
      inferenceMs: 2,
    });
    client.emit('drift', {
      windowEndSample: 1,
      divergence: 0,
      levelDeltaDb: 0,
      drifting: false,
      sustained: false,
    });
    expect(recorder.onAnomaly).toHaveBeenCalled();
    expect(recorder.onResult).toHaveBeenCalled();
    expect(recorder.onDrift).toHaveBeenCalled();
    await store.getState().stop();
    expect(recorder.endSession).toHaveBeenCalled();
  });
});
