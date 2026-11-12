// Worker d'inférence : YAMNet (MediaPipe Audio Classifier) sur fenêtre glissante.
// Rien ici ne touche au DOM ; l'audio ne quitte pas le navigateur.

import { AudioClassifier } from '@mediapipe/tasks-audio';
import { TARGET_SAMPLE_RATE } from '../audio/config';
import {
  ASSETS,
  INFERENCE_HOP_SAMPLES,
  MIN_FAMILY_SCORE,
  TOP_K,
  YAMNET_WINDOW_SAMPLES,
} from './config';
import { buildFamilyTable, classify, type FamiliesFile, type FamilyTable } from './families';
import type { MainToWorker, WorkerToMain } from './messages';
import { fetchCached } from './modelCache';
import { SlidingWindow } from './windowing';

const scope = self as unknown as DedicatedWorkerGlobalScope;

let classifier: AudioClassifier | null = null;
let table: FamilyTable | null = null;
const windows = new SlidingWindow(YAMNET_WINDOW_SAMPLES, INFERENCE_HOP_SAMPLES);

function post(message: WorkerToMain) {
  scope.postMessage(message);
}

function blobUrl(bytes: ArrayBuffer, type: string): string {
  return URL.createObjectURL(new Blob([bytes], { type }));
}

async function init(baseUrl: string) {
  const t0 = performance.now();
  const url = (path: string) => new URL(path, baseUrl).toString();
  const [loader, binary, model, families] = await Promise.all([
    fetchCached(url(ASSETS.wasmLoader)),
    fetchCached(url(ASSETS.wasmBinary)),
    fetchCached(url(ASSETS.model)),
    fetchCached(url(ASSETS.families)),
  ]);

  table = buildFamilyTable(JSON.parse(new TextDecoder().decode(families.bytes)) as FamiliesFile);
  classifier = await AudioClassifier.createFromOptions(
    {
      wasmLoaderPath: blobUrl(loader.bytes, 'text/javascript'),
      wasmBinaryPath: blobUrl(binary.bytes, 'application/wasm'),
    },
    {
      baseOptions: { modelAssetBuffer: new Uint8Array(model.bytes) },
      // Toutes les classes : l'agrégation par famille a besoin du vecteur complet.
      maxResults: -1,
    },
  );
  classifier.setDefaultSampleRate(TARGET_SAMPLE_RATE);

  post({
    type: 'ready',
    loadMs: performance.now() - t0,
    fromCache: loader.fromCache && binary.fromCache && model.fromCache && families.fromCache,
    modelBytes: model.bytes.byteLength,
  });
}

function analyse(samples: Float32Array) {
  if (!classifier || !table) return;
  for (const window of windows.push(samples)) {
    const t0 = performance.now();
    const results = classifier.classify(window.samples, TARGET_SAMPLE_RATE);
    const categories = results.at(-1)?.classifications[0]?.categories ?? [];
    const scores = categories.map((c) => ({
      index: c.index,
      name: c.categoryName,
      score: c.score,
    }));
    const classification = classify(scores, table, {
      topK: TOP_K,
      minFamilyScore: MIN_FAMILY_SCORE,
    });
    post({
      type: 'result',
      ...classification,
      windowEndSample: window.endSample,
      inferenceMs: performance.now() - t0,
    });
  }
}

scope.onmessage = (event: MessageEvent<MainToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      init(message.baseUrl).catch((error: unknown) => {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      });
      break;
    case 'audio':
      analyse(message.samples);
      break;
    case 'reset':
      windows.reset();
      break;
  }
};
