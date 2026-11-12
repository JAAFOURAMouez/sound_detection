// Copie le runtime WASM de MediaPipe Audio dans public/vendor (auto-hébergé, non versionné).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/@mediapipe/tasks-audio/wasm');
const target = join(root, 'public/vendor/mediapipe');
const files = ['audio_wasm_module_internal.js', 'audio_wasm_module_internal.wasm'];

function isUpToDate(from, to) {
  try {
    return (
      statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs
    );
  } catch {
    return false;
  }
}

mkdirSync(target, { recursive: true });
for (const file of files) {
  const from = join(source, file);
  const to = join(target, file);
  if (!isUpToDate(from, to)) copyFileSync(from, to);
}
console.log(`MediaPipe Audio → ${target}`);
