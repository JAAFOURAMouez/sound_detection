// Contrat de messages entre le thread principal et le worker d'inférence.

import type { Classification } from './families';

export type MainToWorker =
  { type: 'init'; baseUrl: string } | { type: 'audio'; samples: Float32Array } | { type: 'reset' };

export interface LoadInfo {
  loadMs: number;
  /** Vrai si le modèle et le runtime venaient tous de la Cache API. */
  fromCache: boolean;
  modelBytes: number;
}

export interface InferenceResult extends Classification {
  /** Indice (à 16 kHz, depuis le début du flux) de la fin de la fenêtre analysée. */
  windowEndSample: number;
  inferenceMs: number;
}

export type WorkerToMain =
  | ({ type: 'ready' } & LoadInfo)
  | { type: 'error'; message: string }
  | ({ type: 'result' } & InferenceResult);
