// Côté thread principal : pilote le worker d'inférence.

import type { ClassifierKind } from './config';
import type { EngineEvent } from './engine';
import type { LoadInfo, MainToWorker, WorkerToMain } from './messages';

export interface WorkerLike {
  postMessage(message: MainToWorker, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<WorkerToMain>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

type EngineEventType = EngineEvent['type'];
export type Received<T extends EngineEventType> = Omit<
  Extract<EngineEvent, { type: T }>,
  'type'
> & {
  receivedAt: number;
};
type Listener<T extends EngineEventType> = (event: Received<T>) => void;

/** Résultat de classification horodaté à la réception (compatibilité). */
export type ResultListener = Listener<'result'>;

export function createInferenceWorker(): WorkerLike {
  return new Worker(new URL('./inference.worker.ts', import.meta.url), {
    type: 'module',
    name: 'soundguard-inference',
  });
}

export class ClassifierClient {
  private readonly worker: WorkerLike;
  private readonly listeners = new Map<EngineEventType, Set<(event: never) => void>>();
  private readonly classifierWaiters = new Map<ClassifierKind, ((ok: boolean) => void)[]>();
  private readonly errorListeners = new Set<(message: string) => void>();
  private ready: Promise<LoadInfo> | null = null;
  private readonly now: () => number;

  constructor(
    worker: WorkerLike = createInferenceWorker(),
    now: () => number = () => performance.now(),
  ) {
    this.worker = worker;
    this.now = now;
  }

  /** Charge les modèles (une seule fois) ; `baseUrl` est l'URL de base du site. */
  load(baseUrl: string, classifier: ClassifierKind = 'yamnet'): Promise<LoadInfo> {
    this.ready ??= new Promise<LoadInfo>((resolve, reject) => {
      let loaded = false;
      this.worker.onmessage = (event) => {
        const message = event.data;
        switch (message.type) {
          case 'ready': {
            loaded = true;
            const { loadMs, fromCache, modelBytes, anomaly } = message;
            resolve({ loadMs, fromCache, modelBytes, anomaly });
            break;
          }
          case 'error':
            if (loaded)
              this.errorListeners.forEach((l) => {
                l(message.message);
              });
            else reject(new Error(message.message));
            break;
          case 'classifier': {
            const waiters = this.classifierWaiters.get(message.kind) ?? [];
            this.classifierWaiters.delete(message.kind);
            waiters.forEach((w) => {
              w(message.ok);
            });
            break;
          }
          default:
            this.dispatch(message);
        }
      };
      this.worker.onerror = (event) => {
        reject(new Error(event.message || 'Erreur du worker d’inférence'));
      };
      this.worker.postMessage({ type: 'init', baseUrl, classifier });
    });
    return this.ready;
  }

  private dispatch(message: EngineEvent): void {
    const { type, ...rest } = message;
    const payload = { ...rest, receivedAt: this.now() };
    this.listeners.get(type)?.forEach((listener) => {
      (listener as (event: typeof payload) => void)(payload);
    });
  }

  on<T extends EngineEventType>(type: T, listener: Listener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  onResult(listener: ResultListener): () => void {
    return this.on('result', listener);
  }

  onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** Envoie un bloc 16 kHz ; il est copié pour ne pas priver le tampon circulaire de ses données. */
  push(samples: Float32Array): void {
    const copy = samples.slice();
    this.worker.postMessage({ type: 'audio', samples: copy }, [copy.buffer]);
  }

  calibrate(seconds: number): void {
    this.worker.postMessage({ type: 'calibrate', seconds });
  }

  /** Change de classifieur ; résout à vrai une fois le modèle prêt. */
  setClassifier(kind: ClassifierKind): Promise<boolean> {
    return new Promise((resolve) => {
      const waiters = this.classifierWaiters.get(kind) ?? [];
      waiters.push(resolve);
      this.classifierWaiters.set(kind, waiters);
      this.worker.postMessage({ type: 'setClassifier', kind });
    });
  }

  reset(): void {
    this.worker.postMessage({ type: 'reset' });
  }

  dispose(): void {
    this.listeners.clear();
    this.worker.terminate();
  }
}
