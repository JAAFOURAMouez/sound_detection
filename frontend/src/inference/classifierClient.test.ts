import { describe, expect, it, vi } from 'vitest';
import { ClassifierClient, type WorkerLike } from './classifierClient';
import type { MainToWorker, WorkerToMain } from './messages';

function fakeWorker() {
  const sent: MainToWorker[] = [];
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn((m: MainToWorker) => sent.push(m)),
    terminate: vi.fn(),
  };
  const emit = (data: WorkerToMain) => worker.onmessage?.({ data } as MessageEvent<WorkerToMain>);
  return { worker, sent, emit };
}

describe('ClassifierClient', () => {
  it('initialise une seule fois et résout au message « ready »', async () => {
    const { worker, sent, emit } = fakeWorker();
    const client = new ClassifierClient(worker);
    const a = client.load('http://x/');
    const b = client.load('http://x/');
    expect(a).toBe(b);
    expect(sent).toEqual([{ type: 'init', baseUrl: 'http://x/' }]);
    emit({ type: 'ready', loadMs: 12, fromCache: true, modelBytes: 4 });
    await expect(a).resolves.toEqual({ loadMs: 12, fromCache: true, modelBytes: 4 });
  });

  it('rejette si le worker signale une erreur', async () => {
    const { worker, emit } = fakeWorker();
    const client = new ClassifierClient(worker);
    const loading = client.load('http://x/');
    emit({ type: 'error', message: 'modèle absent' });
    await expect(loading).rejects.toThrow('modèle absent');
  });

  it('transmet les résultats horodatés aux abonnés', async () => {
    const { worker, emit } = fakeWorker();
    const client = new ClassifierClient(worker, () => 42);
    const loading = client.load('http://x/');
    emit({ type: 'ready', loadMs: 1, fromCache: false, modelBytes: 1 });
    await loading;
    const listener = vi.fn();
    client.onResult(listener);
    emit({
      type: 'result',
      top: [],
      families: [],
      dominant: null,
      windowEndSample: 15_600,
      inferenceMs: 3,
    });
    expect(listener).toHaveBeenCalledWith({
      top: [],
      families: [],
      dominant: null,
      windowEndSample: 15_600,
      inferenceMs: 3,
      receivedAt: 42,
    });
  });

  it('copie les blocs envoyés au worker', () => {
    const { worker, sent } = fakeWorker();
    const client = new ClassifierClient(worker);
    const chunk = new Float32Array([1, 2, 3]);
    client.push(chunk);
    const message = sent[0];
    expect(message?.type).toBe('audio');
    if (message?.type === 'audio') {
      expect(message.samples).not.toBe(chunk);
      expect(Array.from(message.samples)).toEqual([1, 2, 3]);
    }
  });
});
