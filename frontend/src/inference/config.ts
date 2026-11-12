// Paramètres de l'inférence (voir docs/ARCHITECTURE.md).

import { TARGET_SAMPLE_RATE } from '../audio/config';

/** YAMNet analyse des fenêtres de 0,975 s (15 600 échantillons à 16 kHz). */
export const YAMNET_WINDOW_SAMPLES = 15_600;

/** Pas entre deux analyses. */
export const INFERENCE_HOP_SECONDS = 0.5;
export const INFERENCE_HOP_SAMPLES = Math.round(INFERENCE_HOP_SECONDS * TARGET_SAMPLE_RATE);

/** Nombre de classes affichées en direct. */
export const TOP_K = 3;

/** Score minimal pour désigner une famille dominante. */
export const MIN_FAMILY_SCORE = 0.15;

/** Score à partir duquel une famille est jugée confiante (la plus grave l'emporte). */
export const CONFIDENT_FAMILY_SCORE = 0.5;

/** Fichiers servis depuis le site (chemins relatifs à la base Vite). */
export const ASSETS = {
  model: 'models/yamnet.tflite',
  families: 'models/families.json',
  wasmLoader: 'vendor/mediapipe/audio_wasm_module_internal.js',
  wasmBinary: 'vendor/mediapipe/audio_wasm_module_internal.wasm',
} as const;
