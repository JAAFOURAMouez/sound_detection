// Processeur AudioWorklet : rééchantillonne le micro vers 16 kHz et envoie des blocs fixes.
// Tourne sur le thread audio du navigateur ; aucune donnée ne sort de la page.

import { CAPTURE_PROCESSOR_NAME } from './config';
import { Resampler } from './resampler';
import type { CaptureProcessorOptions, WorkletToMain } from './workletMessages';

// Globals de l'AudioWorkletGlobalScope (absents de lib.dom).
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(
  name: string,
  processorCtor: new (options: {
    processorOptions?: CaptureProcessorOptions;
  }) => AudioWorkletProcessor,
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly resampler: Resampler;
  private readonly chunkSamples: number;
  private chunk: Float32Array;
  private filled = 0;
  private mono = new Float32Array(128);

  constructor(options: { processorOptions?: CaptureProcessorOptions }) {
    super();
    const targetRate = options.processorOptions?.targetRate ?? 16_000;
    this.chunkSamples = options.processorOptions?.chunkSamples ?? 1_600;
    this.resampler = new Resampler(sampleRate, targetRate);
    this.chunk = new Float32Array(this.chunkSamples);
    // Seul message possible pour l'instant : remise à zéro après une pause.
    this.port.onmessage = () => {
      this.resampler.reset();
      this.filled = 0;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    const first = channels?.[0];
    if (!channels || !first) return true;

    let samples = first;
    if (channels.length > 1) {
      if (this.mono.length !== first.length) this.mono = new Float32Array(first.length);
      this.mono.fill(0);
      for (const channel of channels) {
        for (let i = 0; i < channel.length; i++) {
          this.mono[i] = (this.mono[i] ?? 0) + (channel[i] ?? 0) / channels.length;
        }
      }
      samples = this.mono;
    }

    const resampled = this.resampler.process(samples);
    let offset = 0;
    while (offset < resampled.length) {
      const take = Math.min(this.chunkSamples - this.filled, resampled.length - offset);
      this.chunk.set(resampled.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === this.chunkSamples) {
        const message: WorkletToMain = { type: 'chunk', samples: this.chunk };
        this.port.postMessage(message, [this.chunk.buffer]);
        this.chunk = new Float32Array(this.chunkSamples);
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor(CAPTURE_PROCESSOR_NAME, CaptureProcessor);
