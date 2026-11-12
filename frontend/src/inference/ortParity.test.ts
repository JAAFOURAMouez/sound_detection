// @vitest-environment node
/// <reference types="node" />
// Parité ONNX Runtime Web (WASM, ici exécuté sous Node) contre ONNX Runtime Python et PyTorch,
// sur les mêmes fenêtres d'entrée (fichiers générés par ml/soundguard_ml/parity_fixture.py).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-web';
import { describe, expect, it } from 'vitest';

const TOLERANCE = 1e-3;
const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

interface Outputs {
  classifier: { logits: number[][]; probs: number[][] };
  autoencoder: { score: number[]; embedding: number[][] };
}

const expected = JSON.parse(readFileSync(here('./__fixtures__/parity-expected.json'), 'utf8')) as {
  windows: string[];
  shape: [number, number];
  onnxruntime_python: Outputs;
  pytorch?: Outputs;
};
const raw = readFileSync(here('./__fixtures__/parity-inputs.f32'));
const inputs = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);

ort.env.wasm.numThreads = 1;

async function run(model: string) {
  const session = await ort.InferenceSession.create(
    readFileSync(here(`../../public/models/${model}`)),
  );
  const out = await session.run({ waveform: new ort.Tensor('float32', inputs, expected.shape) });
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, Array.from(v.data as Float32Array)]),
  );
}

function maxAbsDiff(actual: number[], reference: number[]): number {
  expect(actual).toHaveLength(reference.length);
  return Math.max(...actual.map((x, i) => Math.abs(x - (reference[i] ?? Number.NaN))));
}

describe('parité ONNX Runtime Web', () => {
  it('classifieur : identique à ONNX Runtime Python et à PyTorch à 1e-3', async () => {
    const out = await run('classifier.onnx');
    for (const [name, reference] of [
      ['ORT Python', expected.onnxruntime_python],
      ['PyTorch', expected.pytorch],
    ] as const) {
      if (!reference) continue;
      const logits = maxAbsDiff(out.logits ?? [], reference.classifier.logits.flat());
      const probs = maxAbsDiff(out.probs ?? [], reference.classifier.probs.flat());
      console.log(
        `classifieur vs ${name} : écart max logits ${logits.toExponential(2)}, probs ${probs.toExponential(2)}`,
      );
      expect(logits).toBeLessThan(TOLERANCE);
      expect(probs).toBeLessThan(TOLERANCE);
    }
  });

  it('autoencodeur : identique à ONNX Runtime Python et à PyTorch à 1e-3', async () => {
    const out = await run('autoencoder.onnx');
    for (const [name, reference] of [
      ['ORT Python', expected.onnxruntime_python],
      ['PyTorch', expected.pytorch],
    ] as const) {
      if (!reference) continue;
      const score = maxAbsDiff(out.score ?? [], reference.autoencoder.score);
      const embedding = maxAbsDiff(out.embedding ?? [], reference.autoencoder.embedding.flat());
      console.log(
        `autoencodeur vs ${name} : écart max score ${score.toExponential(2)}, embedding ${embedding.toExponential(2)}`,
      );
      expect(score).toBeLessThan(TOLERANCE);
      expect(embedding).toBeLessThan(TOLERANCE);
    }
  });
});
