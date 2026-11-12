// Mode démonstration : rejoue des échantillons à travers la même chaîne que le micro
// (worklet, rééchantillonnage, inférence), sans demander l'accès au micro.

import {
  browserEnvironment,
  buildPipeline,
  type CaptureSession,
  type PipelineEnvironment,
} from './capture';

export interface DemoSession extends CaptureSession {
  readonly kind: 'demo';
  /** Joue un échantillon (en remplaçant le précédent) ; renvoie l'instant de départ (performance.now). */
  playSample(url: string): Promise<{ startedAt: number; duration: number }>;
}

export interface DemoEnvironment extends PipelineEnvironment {
  fetch: typeof fetch;
  now: () => number;
}

export function browserDemoEnvironment(): DemoEnvironment {
  return {
    ...browserEnvironment(),
    fetch: (...args) => fetch(...args),
    now: () => performance.now(),
  };
}

export async function startDemo(
  env: DemoEnvironment = browserDemoEnvironment(),
): Promise<DemoSession> {
  let current: AudioBufferSourceNode | null = null;
  const stopCurrent = () => {
    if (!current) return;
    current.onended = null;
    try {
      current.stop();
    } catch {
      // déjà arrêté
    }
    current.disconnect();
    current = null;
  };

  const pipeline = await buildPipeline(env, { onStop: stopCurrent });
  const { context, input } = pipeline;
  // En démonstration, on entend ce qui est analysé.
  input.connect(context.destination);
  const decoded = new Map<string, AudioBuffer>();

  return {
    kind: 'demo',
    ...pipeline.session,
    async playSample(url) {
      let buffer = decoded.get(url);
      if (!buffer) {
        const response = await env.fetch(url);
        if (!response.ok) throw new Error(`Échantillon introuvable : ${url}`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        decoded.set(url, buffer);
      }
      stopCurrent();
      if (context.state === 'suspended') await context.resume();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(input);
      source.onended = () => {
        if (current === source) current = null;
        source.disconnect();
      };
      current = source;
      source.start();
      return { startedAt: env.now(), duration: buffer.duration };
    },
  };
}
