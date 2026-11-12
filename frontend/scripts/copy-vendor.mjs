// Copie les runtimes WASM (MediaPipe Audio, onnxruntime-web) dans public/vendor (auto-hébergés, non versionnés).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const copies = [
  {
    source: 'node_modules/@mediapipe/tasks-audio/wasm',
    target: 'public/vendor/mediapipe',
    files: ['audio_wasm_module_internal.js', 'audio_wasm_module_internal.wasm'],
  },
  {
    // Variante WASM de base (mono-thread possible, sans WebGPU) : la plus légère.
    source: 'node_modules/onnxruntime-web/dist',
    target: 'public/vendor/onnxruntime',
    files: ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'],
  },
];

function isUpToDate(from, to) {
  try {
    return (
      statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs
    );
  } catch {
    return false;
  }
}

for (const { source, target, files } of copies) {
  mkdirSync(join(root, target), { recursive: true });
  for (const file of files) {
    const from = join(root, source, file);
    const to = join(root, target, file);
    if (!isUpToDate(from, to)) copyFileSync(from, to);
  }
  console.log(`${source} → ${target}`);
}
