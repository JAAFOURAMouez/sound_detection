// Contrat de messages entre le thread principal et le worker d'inférence.

import type { ClassifierKind } from './config';
import type { EngineEvent } from './engine';

export type MainToWorker =
  | { type: 'init'; baseUrl: string; classifier: ClassifierKind }
  | { type: 'setClassifier'; kind: ClassifierKind }
  | { type: 'calibrate'; seconds: number }
  | { type: 'audio'; samples: Float32Array }
  | { type: 'reset' };

export interface LoadInfo {
  loadMs: number;
  /** Vrai si tous les fichiers venaient de la Cache API. */
  fromCache: boolean;
  modelBytes: number;
  /** Faux si l'autoencodeur n'a pas pu être chargé (classification seule). */
  anomaly: boolean;
}

export type WorkerToMain =
  | ({ type: 'ready' } & LoadInfo)
  | { type: 'error'; message: string }
  | { type: 'classifier'; kind: ClassifierKind; ok: boolean; message?: string }
  | EngineEvent;

export type InferenceResult = Omit<Extract<EngineEvent, { type: 'result' }>, 'type'>;
export type AnomalyResult = Omit<Extract<EngineEvent, { type: 'anomaly' }>, 'type'>;
export type DriftResult = Omit<Extract<EngineEvent, { type: 'drift' }>, 'type'>;
