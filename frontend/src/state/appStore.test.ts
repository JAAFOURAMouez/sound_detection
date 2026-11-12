import { describe, expect, it, vi } from 'vitest';
import { CaptureError, type CaptureSession } from '../audio/capture';
import { createAppStore } from './appStore';

function fakeSession() {
  const spies = {
    pause: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    stop: vi.fn(() => Promise.resolve()),
  };
  const session: CaptureSession = {
    analyser: {} as AnalyserNode,
    inputSampleRate: 48_000,
    ring: {} as CaptureSession['ring'],
    onChunk: () => () => undefined,
    ...spies,
  };
  return { session, spies };
}

describe('appStore', () => {
  it('démarre à l’arrêt', () => {
    expect(createAppStore().getState().status).toBe('idle');
  });

  it('passe par la demande d’autorisation puis l’écoute', async () => {
    let resolve: (s: CaptureSession) => void = () => undefined;
    const store = createAppStore(() => new Promise((r) => (resolve = r)));
    const pending = store.getState().requestCapture();
    expect(store.getState().status).toBe('consent');
    resolve(fakeSession().session);
    await pending;
    expect(store.getState().status).toBe('monitoring');
  });

  it('enregistre la cause d’un refus et permet de réessayer', async () => {
    const start = vi
      .fn<() => Promise<CaptureSession>>()
      .mockRejectedValueOnce(new CaptureError('denied'))
      .mockResolvedValueOnce(fakeSession().session);
    const store = createAppStore(start);
    await store.getState().requestCapture();
    expect(store.getState()).toMatchObject({ status: 'error', errorKind: 'denied' });
    await store.getState().requestCapture();
    expect(store.getState()).toMatchObject({ status: 'monitoring', errorKind: null });
  });

  it('ignore une deuxième demande pendant l’écoute', async () => {
    const start = vi.fn(() => Promise.resolve(fakeSession().session));
    const store = createAppStore(start);
    await store.getState().requestCapture();
    await store.getState().requestCapture();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('met en pause, reprend et arrête la session', async () => {
    const { session, spies } = fakeSession();
    const store = createAppStore(() => Promise.resolve(session));
    await store.getState().requestCapture();

    await store.getState().pause();
    expect(store.getState().status).toBe('paused');
    expect(spies.pause).toHaveBeenCalled();

    await store.getState().resume();
    expect(store.getState().status).toBe('monitoring');

    await store.getState().stop();
    expect(store.getState()).toMatchObject({ status: 'idle', session: null });
    expect(spies.stop).toHaveBeenCalled();
  });

  it('ne reprend pas si l’écoute n’est pas en pause', async () => {
    const { session, spies } = fakeSession();
    const store = createAppStore(() => Promise.resolve(session));
    await store.getState().requestCapture();
    await store.getState().resume();
    expect(spies.resume).not.toHaveBeenCalled();
  });
});
