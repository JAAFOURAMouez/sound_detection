// Chargement des modèles dans le worker : YAMNet (MediaPipe) et modèles ONNX (onnxruntime-web).
// Tous les fichiers passent par la Cache API (téléchargés une seule fois).

import { AudioClassifier } from '@mediapipe/tasks-audio';
import * as ort from 'onnxruntime-web/wasm';
import { TARGET_SAMPLE_RATE } from '../audio/config';
import { ASSETS, ONNX_WINDOW_SAMPLES, YAMNET_WINDOW_SAMPLES } from './config';
import type { AnomalyModel, ClassifierModel } from './engine';
import { buildFamilyTable, type FamiliesFile } from './families';
import { type CachedAsset, fetchCached } from './modelCache';

export interface Loaded<T> {
  model: T;
  assets: CachedAsset[];
}

function blobUrl(bytes: ArrayBuffer, type: string): string {
  return URL.createObjectURL(new Blob([bytes], { type }));
}

function json(asset: CachedAsset): unknown {
  return JSON.parse(new TextDecoder().decode(asset.bytes));
}

export async function loadYamnet(url: (path: string) => string): Promise<Loaded<ClassifierModel>> {
  const assets = await Promise.all([
    fetchCached(url(ASSETS.wasmLoader)),
    fetchCached(url(ASSETS.wasmBinary)),
    fetchCached(url(ASSETS.model)),
    fetchCached(url(ASSETS.families)),
  ]);
  const [loader, binary, model, families] = assets;
  const classifier = await AudioClassifier.createFromOptions(
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
  return {
    assets,
    model: {
      kind: 'yamnet',
      window: YAMNET_WINDOW_SAMPLES,
      table: buildFamilyTable(json(families) as FamiliesFile),
      scores(samples) {
        const results = classifier.classify(samples, TARGET_SAMPLE_RATE);
        const categories = results.at(-1)?.classifications[0]?.categories ?? [];
        return categories.map((c) => ({ index: c.index, name: c.categoryName, score: c.score }));
      },
    },
  };
}

let ortReady: Promise<CachedAsset[]> | null = null;

/** Configure onnxruntime-web une seule fois : WASM mono-thread, runtime servi depuis le cache. */
function initOrt(url: (path: string) => string): Promise<CachedAsset[]> {
  ortReady ??= Promise.all([
    fetchCached(url(ASSETS.ortLoader)),
    fetchCached(url(ASSETS.ortWasm)),
  ]).then(([loader, wasm]) => {
    ort.env.wasm.numThreads = 1; // GitHub Pages ne fournit pas les en-têtes COOP/COEP
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = {
      mjs: blobUrl(loader.bytes, 'text/javascript'),
      wasm: blobUrl(wasm.bytes, 'application/wasm'),
    };
    return [loader, wasm];
  });
  return ortReady;
}

async function session(url: (path: string) => string, path: string) {
  const runtime = await initOrt(url);
  const model = await fetchCached(url(path));
  const created = await ort.InferenceSession.create(new Uint8Array(model.bytes), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return { session: created, assets: [...runtime, model] };
}

export async function loadAutoencoder(
  url: (path: string) => string,
): Promise<Loaded<AnomalyModel>> {
  const { session: s, assets } = await session(url, ASSETS.autoencoder);
  return {
    assets,
    model: {
      window: ONNX_WINDOW_SAMPLES,
      async analyse(samples) {
        const input = new ort.Tensor('float32', Float32Array.from(samples), [1, samples.length]);
        const out = await s.run({ waveform: input });
        const score = out.score?.data as Float32Array | undefined;
        const embedding = out.embedding?.data as Float32Array | undefined;
        if (!score || !embedding) throw new Error('Sorties de l’autoencodeur manquantes');
        return { reconstruction: score[0] ?? 0, embedding: Float32Array.from(embedding) };
      },
    },
  };
}

export async function loadCnn(url: (path: string) => string): Promise<Loaded<ClassifierModel>> {
  const [{ session: s, assets }, labelsAsset, familiesAsset] = await Promise.all([
    session(url, ASSETS.cnn),
    fetchCached(url(ASSETS.cnnLabels)),
    fetchCached(url(ASSETS.cnnFamilies)),
  ]);
  const labels = (json(labelsAsset) as { labels: string[] }).labels;
  return {
    assets: [...assets, labelsAsset, familiesAsset],
    model: {
      kind: 'cnn',
      window: ONNX_WINDOW_SAMPLES,
      table: buildFamilyTable(json(familiesAsset) as FamiliesFile),
      async scores(samples) {
        const input = new ort.Tensor('float32', Float32Array.from(samples), [1, samples.length]);
        const out = await s.run({ waveform: input });
        const probs = out.probs?.data as Float32Array | undefined;
        if (!probs) throw new Error('Sortie du classifieur manquante');
        return Array.from(probs, (score, index) => ({
          index,
          name: labels[index] ?? String(index),
          score,
        }));
      },
    },
  };
}
