// Contrat de messages entre le thread principal et le processeur de capture.

export interface CaptureProcessorOptions {
  targetRate: number;
  chunkSamples: number;
}

export interface WorkletToMain {
  type: 'chunk';
  /** Bloc de WORKLET_CHUNK_SAMPLES échantillons à 16 kHz. */
  samples: Float32Array;
}

export interface MainToWorklet {
  type: 'reset';
}
