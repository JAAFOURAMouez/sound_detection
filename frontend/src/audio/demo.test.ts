import { describe, expect, it, vi } from 'vitest';
import { type DemoEnvironment, startDemo } from './demo';

function fakeNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function setup() {
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const input = { ...fakeNode(), gain: { value: 1 } };
  const destination = {};
  let gainCount = 0;
  const context = {
    sampleRate: 48_000,
    state: 'running',
    destination,
    audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
    createAnalyser: vi.fn(() => ({ ...fakeNode(), fftSize: 0, smoothingTimeConstant: 1 })),
    createGain: vi.fn(() => (gainCount++ === 0 ? input : { ...fakeNode(), gain: { value: 1 } })),
    createBufferSource: vi.fn(() => {
      const s = { ...fakeNode(), buffer: null, onended: null, start: vi.fn(), stop: vi.fn() };
      sources.push(s);
      return s;
    }),
    decodeAudioData: vi.fn(() => Promise.resolve({ duration: 4 } as AudioBuffer)),
    resume: vi.fn(() => Promise.resolve()),
    suspend: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const fetchMock = vi.fn(() => Promise.resolve(new Response(new ArrayBuffer(8))));
  const env: DemoEnvironment = {
    createContext: () => context as unknown as AudioContext,
    createWorkletNode: () =>
      ({ ...fakeNode(), port: { onmessage: null } }) as unknown as AudioWorkletNode,
    workletUrl: '/w.js',
    fetch: fetchMock,
    now: () => 1234,
  };
  return { env, context, input, destination, sources, fetchMock };
}

describe('startDemo', () => {
  it('rend audible ce qui est analysé', async () => {
    const { env, input, destination } = setup();
    const session = await startDemo(env);
    expect(session.kind).toBe('demo');
    expect(input.connect).toHaveBeenCalledWith(destination);
  });

  it('joue un échantillon dans la chaîne, sans redécoder la seconde fois', async () => {
    const { env, sources, fetchMock, context, input } = setup();
    const session = await startDemo(env);
    const played = await session.playSample('/samples/a.ogg');
    expect(played).toEqual({ startedAt: 1234, duration: 4 });
    expect(sources[0]?.start).toHaveBeenCalled();
    expect(
      sources[0] && (sources[0] as unknown as { connect: ReturnType<typeof vi.fn> }).connect,
    ).toHaveBeenCalledWith(input);

    await session.playSample('/samples/a.ogg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    // Le précédent est arrêté avant le suivant.
    expect(sources[0]?.stop).toHaveBeenCalled();
  });

  it('signale un échantillon introuvable', async () => {
    const { env } = setup();
    env.fetch = vi.fn(() => Promise.resolve(new Response('', { status: 404 })));
    const session = await startDemo(env);
    await expect(session.playSample('/samples/x.ogg')).rejects.toThrow('introuvable');
  });

  it('arrête la lecture en cours à l’arrêt de la session', async () => {
    const { env, sources, context } = setup();
    const session = await startDemo(env);
    await session.playSample('/samples/a.ogg');
    await session.stop();
    expect(sources[0]?.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalled();
  });
});
