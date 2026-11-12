// Worker d'inférence : classification (YAMNet ou CNN maison), score d'anomalie calibré, dérive.
// Rien ici ne touche au DOM ; l'audio ne quitte pas le navigateur.

import {
  ANOMALY_K,
  ANOMALY_SMOOTHING,
  type ClassifierKind,
  CONFIDENT_FAMILY_SCORE,
  INFERENCE_HOP_SAMPLES,
  MIN_FAMILY_SCORE,
  TOP_K,
} from './config';
import { AnalysisEngine, type ClassifierModel } from './engine';
import type { MainToWorker, WorkerToMain } from './messages';
import type { CachedAsset } from './modelCache';
import { loadAutoencoder, loadCnn, loadYamnet } from './models';

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerToMain) {
  scope.postMessage(message);
}

const engine = new AnalysisEngine(post, {
  hop: INFERENCE_HOP_SAMPLES,
  topK: TOP_K,
  minFamilyScore: MIN_FAMILY_SCORE,
  confidentScore: CONFIDENT_FAMILY_SCORE,
  k: ANOMALY_K,
  smoothingAlpha: ANOMALY_SMOOTHING,
});

let resolveUrl: ((path: string) => string) | null = null;
const classifiers = new Map<ClassifierKind, Promise<ClassifierModel>>();
const loaders = { yamnet: loadYamnet, cnn: loadCnn };

function loadClassifier(kind: ClassifierKind, assets?: CachedAsset[]): Promise<ClassifierModel> {
  const url = resolveUrl;
  if (!url) return Promise.reject(new Error('Worker non initialisé'));
  let pending = classifiers.get(kind);
  if (!pending) {
    pending = loaders[kind](url).then((loaded) => {
      assets?.push(...loaded.assets);
      return loaded.model;
    });
    classifiers.set(kind, pending);
  }
  return pending;
}

async function init(baseUrl: string, kind: ClassifierKind) {
  const t0 = performance.now();
  resolveUrl = (path) => new URL(path, baseUrl).toString();
  const assets: CachedAsset[] = [];
  const [classifier, anomaly] = await Promise.all([
    loadClassifier(kind, assets),
    loadAutoencoder(resolveUrl).then(
      (loaded) => {
        assets.push(...loaded.assets);
        return loaded.model;
      },
      (error: unknown) => {
        // L'anomalie est un plus : la classification reste utilisable sans elle.
        post({ type: 'error', message: `Autoencodeur indisponible : ${String(error)}` });
        return null;
      },
    ),
  ]);
  engine.setClassifier(classifier);
  engine.setAnomaly(anomaly);
  post({
    type: 'ready',
    loadMs: performance.now() - t0,
    fromCache: assets.every((a) => a.fromCache),
    modelBytes: assets.reduce((sum, a) => sum + a.bytes.byteLength, 0),
    anomaly: anomaly !== null,
  });
}

async function setClassifier(kind: ClassifierKind) {
  try {
    engine.setClassifier(await loadClassifier(kind));
    post({ type: 'classifier', kind, ok: true });
  } catch (error) {
    classifiers.delete(kind);
    post({ type: 'classifier', kind, ok: false, message: String(error) });
  }
}

scope.onmessage = (event: MessageEvent<MainToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      init(message.baseUrl, message.classifier).catch((error: unknown) => {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      });
      break;
    case 'setClassifier':
      void setClassifier(message.kind);
      break;
    case 'calibrate':
      engine.startCalibration(message.seconds);
      break;
    case 'audio':
      engine.push(message.samples).catch((error: unknown) => {
        post({ type: 'error', message: String(error) });
      });
      break;
    case 'reset':
      engine.resetWindows();
      break;
  }
};
