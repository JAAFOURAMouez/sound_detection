// Capture micro : getUserMedia → AudioWorklet (16 kHz) → tampon circulaire,
// plus un AnalyserNode réservé à la visualisation.

import workletUrl from './capture.worklet.ts?worker&url';
import {
  CAPTURE_PROCESSOR_NAME,
  MIC_CONSTRAINTS,
  RING_BUFFER_SECONDS,
  TARGET_SAMPLE_RATE,
  VIZ_FFT_SIZE,
  WORKLET_CHUNK_SAMPLES,
} from './config';
import { RingBuffer } from './ringBuffer';
import type { MainToWorklet, WorkletToMain } from './workletMessages';

export type CaptureErrorKind =
  'denied' | 'no-device' | 'busy' | 'insecure' | 'unsupported' | 'unknown';

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind;

  constructor(kind: CaptureErrorKind, cause?: unknown) {
    super(`Capture impossible : ${kind}`, { cause });
    this.name = 'CaptureError';
    this.kind = kind;
  }
}

/** Traduit une erreur de getUserMedia en catégorie affichable. */
export function classifyMediaError(error: unknown): CaptureErrorKind {
  if (error instanceof CaptureError) return error.kind;
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy';
    default:
      return 'unknown';
  }
}

export type ChunkListener = (samples: Float32Array) => void;

export interface CaptureSession {
  readonly analyser: AnalyserNode;
  readonly inputSampleRate: number;
  readonly ring: RingBuffer;
  onChunk(listener: ChunkListener): () => void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

export interface CaptureEnvironment {
  isSecureContext: boolean;
  mediaDevices: Pick<MediaDevices, 'getUserMedia'> | undefined;
  createContext: () => AudioContext;
  createWorkletNode: (context: AudioContext) => AudioWorkletNode;
  workletUrl: string;
}

export function browserEnvironment(): CaptureEnvironment {
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
    // Pas de sampleRate imposé : on rééchantillonne nous-mêmes depuis la fréquence native.
    createContext: () => new AudioContext({ latencyHint: 'interactive' }),
    createWorkletNode: (context) =>
      new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          targetRate: TARGET_SAMPLE_RATE,
          chunkSamples: WORKLET_CHUNK_SAMPLES,
        },
      }),
    workletUrl,
  };
}

export async function startCapture(
  env: CaptureEnvironment = browserEnvironment(),
): Promise<CaptureSession> {
  if (!env.isSecureContext) throw new CaptureError('insecure');
  if (!env.mediaDevices?.getUserMedia) throw new CaptureError('unsupported');

  let stream: MediaStream;
  try {
    stream = await env.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS, video: false });
  } catch (error) {
    throw new CaptureError(classifyMediaError(error), error);
  }

  const context = env.createContext();
  try {
    await context.audioWorklet.addModule(env.workletUrl);
  } catch (error) {
    stream.getTracks().forEach((track) => {
      track.stop();
    });
    await context.close();
    throw new CaptureError('unsupported', error);
  }

  const source = context.createMediaStreamSource(stream);
  const worklet = env.createWorkletNode(context);
  const analyser = context.createAnalyser();
  analyser.fftSize = VIZ_FFT_SIZE;
  analyser.smoothingTimeConstant = 0;

  // Gain nul vers la sortie : garantit que le graphe est « tiré » sans rien jouer.
  const sink = context.createGain();
  sink.gain.value = 0;
  source.connect(worklet);
  source.connect(analyser);
  worklet.connect(sink);
  analyser.connect(sink);
  sink.connect(context.destination);

  const ring = new RingBuffer(TARGET_SAMPLE_RATE * RING_BUFFER_SECONDS);
  const listeners = new Set<ChunkListener>();
  worklet.port.onmessage = (event: MessageEvent<WorkletToMain>) => {
    const { samples } = event.data;
    ring.push(samples);
    listeners.forEach((listener) => {
      listener(samples);
    });
  };

  if (context.state === 'suspended') await context.resume();

  const setTracksEnabled = (enabled: boolean) => {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  };

  let stopped = false;
  return {
    analyser,
    inputSampleRate: context.sampleRate,
    ring,
    onChunk(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async pause() {
      if (stopped) return;
      setTracksEnabled(false);
      await context.suspend();
    },
    async resume() {
      if (stopped) return;
      setTracksEnabled(true);
      const reset: MainToWorklet = { type: 'reset' };
      worklet.port.postMessage(reset);
      await context.resume();
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      listeners.clear();
      worklet.port.onmessage = null;
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      source.disconnect();
      worklet.disconnect();
      analyser.disconnect();
      sink.disconnect();
      await context.close();
    },
  };
}
