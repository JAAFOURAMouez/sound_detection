// Signaux synthétiques et mesures spectrales pour les tests.

export function sine(
  frequency: number,
  sampleRate: number,
  seconds: number,
  amplitude = 1,
): Float32Array {
  const n = Math.round(sampleRate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

export function rms(signal: Float32Array): number {
  let sum = 0;
  for (const v of signal) sum += v * v;
  return Math.sqrt(sum / Math.max(1, signal.length));
}

/** Amplitude de la composante à `frequency` (DFT ponctuelle, fenêtre de Hann). */
export function toneAmplitude(signal: Float32Array, sampleRate: number, frequency: number): number {
  const n = signal.length;
  let re = 0;
  let im = 0;
  let windowSum = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const phase = (2 * Math.PI * frequency * i) / sampleRate;
    const v = (signal[i] ?? 0) * w;
    re += v * Math.cos(phase);
    im -= v * Math.sin(phase);
    windowSum += w;
  }
  return (2 * Math.hypot(re, im)) / windowSum;
}

/** Fréquence du pic spectral dans [low, high], au pas `step` Hz. */
export function peakFrequency(
  signal: Float32Array,
  sampleRate: number,
  low: number,
  high: number,
  step = 1,
): number {
  let best = low;
  let bestAmp = -1;
  for (let f = low; f <= high; f += step) {
    const a = toneAmplitude(signal, sampleRate, f);
    if (a > bestAmp) {
      bestAmp = a;
      best = f;
    }
  }
  return best;
}

export function toDb(ratio: number): number {
  return 20 * Math.log10(Math.max(ratio, 1e-12));
}
