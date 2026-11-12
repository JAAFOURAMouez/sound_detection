// Côté thread principal : pilote le worker d'inférence.

import type { InferenceResult, LoadInfo, MainToWorker, WorkerToMain } from './messages';

export interface WorkerLike {
  postMessage(message: MainToWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerToMain>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

export type ResultListener = (result: InferenceResult & { receivedAt: number }) => void;

export function createInferenceWorker(): WorkerLike {
  return new Worker(new URL('./inference.worker.ts', import.meta.url), {
    type: 'module',
    name: 'soundguard-inference',
  });
}

export class ClassifierClient {
  private readonly worker: WorkerLike;
  private readonly listeners = new Set<ResultListener>();
  private ready: Promise<LoadInfo> | null = null;
  private readonly now: () => number;

  constructor(
    worker: WorkerLike = createInferenceWorker(),
    now: () => number = () => performance.now(),
  ) {
    this.worker = worker;
    this.now = now;
  }

  /** Charge le modèle (une seule fois) ; `baseUrl` est l'URL de base du site. */
  load(baseUrl: string): Promise<LoadInfo> {
    this.ready ??= new Promise<LoadInfo>((resolve, reject) => {
      this.worker.onmessage = (event) => {
        const message = event.data;
        switch (message.type) {
          case 'ready': {
            const { loadMs, fromCache, modelBytes } = message;
            resolve({ loadMs, fromCache, modelBytes });
            break;
          }
          case 'error':
            reject(new Error(message.message));
            break;
          case 'result': {
            const { top, families, dominant, windowEndSample, inferenceMs } = message;
            const result = {
              top,
              families,
              dominant,
              windowEndSample,
              inferenceMs,
              receivedAt: this.now(),
            };
            this.listeners.forEach((listener) => {
              listener(result);
            });
            break;
          }
        }
      };
      this.worker.onerror = (event) => {
        reject(new Error(event.message || 'Erreur du worker d’inférence'));
      };
      this.worker.postMessage({ type: 'init', baseUrl });
    });
    return this.ready;
  }

  /** Envoie un bloc 16 kHz ; il est copié pour ne pas priver le tampon circulaire de ses données. */
  push(samples: Float32Array): void {
    const copy = samples.slice();
    this.worker.postMessage({ type: 'audio', samples: copy }, [copy.buffer]);
  }

  reset(): void {
    this.worker.postMessage({ type: 'reset' });
  }

  onResult(listener: ResultListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.worker.terminate();
  }
}
