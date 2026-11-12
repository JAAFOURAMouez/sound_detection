import { describe, expect, it, vi } from 'vitest';
import { type CaptureEnvironment, CaptureError, classifyMediaError, startCapture } from './capture';
import { MIC_CONSTRAINTS, TARGET_SAMPLE_RATE, WORKLET_CHUNK_SAMPLES } from './config';

class FakeTrack {
  enabled = true;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function setup(overrides: Partial<CaptureEnvironment> = {}) {
  const track = new FakeTrack();
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: vi.fn() };
  const worklet = { ...fakeNode(), port };
  const analyser = { ...fakeNode(), fftSize: 0, smoothingTimeConstant: 1 };
  const context = {
    sampleRate: 48_000,
    state: 'suspended',
    destination: {},
    audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
    createMediaStreamSource: vi.fn(() => fakeNode()),
    createAnalyser: vi.fn(() => analyser),
    createGain: vi.fn(() => ({ ...fakeNode(), gain: { value: 1 } })),
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const getUserMedia = vi.fn(() => Promise.resolve(stream as unknown as MediaStream));
  const env: CaptureEnvironment = {
    isSecureContext: true,
    mediaDevices: { getUserMedia },
    createContext: () => context as unknown as AudioContext,
    createWorkletNode: () => worklet as unknown as AudioWorkletNode,
    workletUrl: '/capture.worklet.js',
    ...overrides,
  };
  return { env, track, port, context, getUserMedia };
}

describe('classifyMediaError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'busy'],
    ['NotSupportedError', 'unsupported'],
    ['TypeError', 'unknown'],
  ])('%s → %s', (name, kind) => {
    expect(classifyMediaError(new DOMException('x', name))).toBe(kind);
  });

  it('gère les valeurs qui ne sont pas des erreurs', () => {
    expect(classifyMediaError('oups')).toBe('unknown');
    expect(classifyMediaError(null)).toBe('unknown');
  });
});

describe('startCapture', () => {
  it('désactive les traitements automatiques du micro', async () => {
    const { env, getUserMedia } = setup();
    await startCapture(env);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: MIC_CONSTRAINTS, video: false });
    expect(MIC_CONSTRAINTS).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it('refuse un contexte non sécurisé sans demander le micro', async () => {
    const { env, getUserMedia } = setup({ isSecureContext: false });
    await expect(startCapture(env)).rejects.toMatchObject({ kind: 'insecure' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('signale un navigateur sans getUserMedia', async () => {
    const { env } = setup({ mediaDevices: undefined });
    await expect(startCapture(env)).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('traduit un refus de permission', async () => {
    const { env } = setup();
    env.mediaDevices = {
      getUserMedia: () => Promise.reject(new DOMException('refus', 'NotAllowedError')),
    };
    const error: unknown = await startCapture(env).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CaptureError);
    expect((error as CaptureError).kind).toBe('denied');
  });

  it('libère le micro si le worklet ne se charge pas', async () => {
    const { env, track, context } = setup();
    context.audioWorklet.addModule = vi.fn(() => Promise.reject(new Error('404')));
    await expect(startCapture(env)).rejects.toMatchObject({ kind: 'unsupported' });
    expect(track.stopped).toBe(true);
    expect(context.close).toHaveBeenCalled();
  });

  it('range les blocs du worklet dans le tampon de 10 s et prévient les abonnés', async () => {
    const { env, port } = setup();
    const session = await startCapture(env);
    const received: number[] = [];
    session.onChunk((s) => received.push(s.length));
    const samples = new Float32Array(WORKLET_CHUNK_SAMPLES).fill(0.5);
    port.onmessage?.({ data: { type: 'chunk', samples } });
    expect(received).toEqual([WORKLET_CHUNK_SAMPLES]);
    expect(session.ring.capacity).toBe(TARGET_SAMPLE_RATE * 10);
    expect(session.ring.latest(1)[0]).toBe(0.5);
    expect(session.inputSampleRate).toBe(48_000);
  });

  it('met en pause, reprend et s’arrête proprement', async () => {
    const { env, track, port, context } = setup();
    const session = await startCapture(env);
    await session.pause();
    expect(track.enabled).toBe(false);
    expect(context.suspend).toHaveBeenCalled();

    await session.resume();
    expect(track.enabled).toBe(true);
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'reset' });

    await session.stop();
    expect(track.stopped).toBe(true);
    expect(context.close).toHaveBeenCalledTimes(1);
    await session.stop();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
