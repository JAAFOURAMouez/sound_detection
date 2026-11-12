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

const ready: WorkerToMain = {
  type: 'ready',
  loadMs: 12,
  fromCache: true,
  modelBytes: 4,
  anomaly: true,
};

describe('ClassifierClient', () => {
  it('initialise une seule fois avec le classifieur choisi', async () => {
    const { worker, sent, emit } = fakeWorker();
    const client = new ClassifierClient(worker);
    const a = client.load('http://x/', 'cnn');
    expect(client.load('http://x/')).toBe(a);
    expect(sent).toEqual([{ type: 'init', baseUrl: 'http://x/', classifier: 'cnn' }]);
    emit(ready);
    await expect(a).resolves.toEqual({ loadMs: 12, fromCache: true, modelBytes: 4, anomaly: true });
  });

  it('rejette si le worker échoue au chargement, puis relaie les erreurs ultérieures', async () => {
    const { worker, emit } = fakeWorker();
    const client = new ClassifierClient(worker);
    const loading = client.load('http://x/');
    emit({ type: 'error', message: 'modèle absent' });
    await expect(loading).rejects.toThrow('modèle absent');

    const other = fakeWorker();
    const c2 = new ClassifierClient(other.worker);
    const onError = vi.fn();
    c2.onError(onError);
    const l2 = c2.load('http://x/');
    other.emit(ready);
    await l2;
    other.emit({ type: 'error', message: 'plus tard' });
    expect(onError).toHaveBeenCalledWith('plus tard');
  });

  it('distribue chaque type d’évènement à ses abonnés, horodaté', async () => {
    const { worker, emit } = fakeWorker();
    const client = new ClassifierClient(worker, () => 42);
    const loading = client.load('http://x/');
    emit(ready);
    await loading;
    const onResult = vi.fn();
    const onAnomaly = vi.fn();
    client.onResult(onResult);
    client.on('anomaly', onAnomaly);
    emit({
      type: 'result',
      model: 'yamnet',
      top: [],
      families: [],
      dominant: null,
      windowEndSample: 15_600,
      inferenceMs: 3,
    });
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ windowEndSample: 15_600, receivedAt: 42 }),
    );
    expect(onAnomaly).not.toHaveBeenCalled();
    emit({
      type: 'anomaly',
      windowEndSample: 16_000,
      raw: 0.2,
      score: 0.1,
      zReconstruction: 1,
      zEmbedding: 0.5,
      levelDb: -50,
      above: false,
      alert: false,
    });
    expect(onAnomaly).toHaveBeenCalledWith(expect.objectContaining({ score: 0.1, receivedAt: 42 }));
  });

  it('attend la confirmation du changement de classifieur', async () => {
    const { worker, sent, emit } = fakeWorker();
    const client = new ClassifierClient(worker);
    const loading = client.load('http://x/');
    emit(ready);
    await loading;
    const switching = client.setClassifier('cnn');
    expect(sent.at(-1)).toEqual({ type: 'setClassifier', kind: 'cnn' });
    emit({ type: 'classifier', kind: 'cnn', ok: true });
    await expect(switching).resolves.toBe(true);
  });

  it('copie les blocs envoyés et transmet la calibration', () => {
    const { worker, sent } = fakeWorker();
    const client = new ClassifierClient(worker);
    const chunk = new Float32Array([1, 2, 3]);
    client.push(chunk);
    client.calibrate(30);
    const message = sent[0];
    expect(message?.type).toBe('audio');
    if (message?.type === 'audio') {
      expect(message.samples).not.toBe(chunk);
      expect(Array.from(message.samples)).toEqual([1, 2, 3]);
    }
    expect(sent[1]).toEqual({ type: 'calibrate', seconds: 30 });
  });
});
