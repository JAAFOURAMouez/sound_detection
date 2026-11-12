import { describe, expect, it } from 'vitest';
import { peakFrequency, rms, sine, toDb, toneAmplitude } from '../test/signals';
import { TARGET_SAMPLE_RATE } from './config';
import { Resampler, rationalRatio } from './resampler';

const RATES = [44_100, 48_000];

/** Rééchantillonne par blocs de 128 (taille d'un rendu AudioWorklet) et retire le régime transitoire. */
function resampleSteady(input: Float32Array, inputRate: number): Float32Array {
  const r = new Resampler(inputRate, TARGET_SAMPLE_RATE);
  const parts: Float32Array[] = [];
  for (let i = 0; i < input.length; i += 128) {
    parts.push(r.process(input.subarray(i, i + 128)));
  }
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  const skip = r.latencySamples * 2;
  return out.subarray(skip, out.length - skip);
}

describe('rationalRatio', () => {
  it('réduit les rapports usuels', () => {
    expect(rationalRatio(48_000, 16_000)).toEqual({ up: 1, down: 3 });
    expect(rationalRatio(44_100, 16_000)).toEqual({ up: 160, down: 441 });
    expect(rationalRatio(16_000, 16_000)).toEqual({ up: 1, down: 1 });
  });

  it('refuse les fréquences invalides', () => {
    expect(() => rationalRatio(0, 16_000)).toThrow();
    expect(() => rationalRatio(44_100.5, 16_000)).toThrow();
  });
});

describe.each(RATES)('Resampler %i Hz → 16 kHz', (inputRate) => {
  it('conserve la durée du signal', () => {
    const input = sine(440, inputRate, 2);
    const r = new Resampler(inputRate, TARGET_SAMPLE_RATE);
    const out = r.process(input);
    expect(Math.abs(out.length - 2 * TARGET_SAMPLE_RATE)).toBeLessThanOrEqual(1);
  });

  it('conserve la fréquence d’une sinusoïde à 1 kHz', () => {
    const out = resampleSteady(sine(1_000, inputRate, 1.5), inputRate);
    expect(peakFrequency(out, TARGET_SAMPLE_RATE, 900, 1_100, 0.5)).toBeCloseTo(1_000, 0);
  });

  it('conserve l’amplitude dans la bande passante (≤ 0,1 dB à 1 et 5 kHz)', () => {
    for (const f of [1_000, 5_000]) {
      const out = resampleSteady(sine(f, inputRate, 1.5, 0.5), inputRate);
      const gainDb = toDb(toneAmplitude(out, TARGET_SAMPLE_RATE, f) / 0.5);
      expect(Math.abs(gainDb)).toBeLessThan(0.1);
    }
  });

  it('élimine une sinusoïde à 12 kHz (au-dessus de Nyquist) d’au moins 60 dB', () => {
    const input = sine(12_000, inputRate, 1.5, 0.5);
    const out = resampleSteady(input, inputRate);
    // Le repliement tomberait à 4 kHz : on mesure la puissance résiduelle totale.
    expect(toDb(rms(out) / rms(input))).toBeLessThan(-60);
  });

  it('élimine aussi une sinusoïde juste au-dessus de 8 kHz (9 kHz) d’au moins 60 dB', () => {
    const input = sine(9_000, inputRate, 1.5, 0.5);
    const out = resampleSteady(input, inputRate);
    expect(toDb(rms(out) / rms(input))).toBeLessThan(-60);
  });

  it('donne le même résultat par blocs irréguliers que d’un seul coup', () => {
    const input = sine(700, inputRate, 0.5);
    const whole = new Resampler(inputRate, TARGET_SAMPLE_RATE).process(input);
    const chunked = new Resampler(inputRate, TARGET_SAMPLE_RATE);
    const sizes = [1, 127, 128, 333, 7, 1024];
    const parts: number[] = [];
    let i = 0;
    let k = 0;
    while (i < input.length) {
      const size = sizes[k++ % sizes.length] ?? 128;
      parts.push(...chunked.process(input.subarray(i, i + size)));
      i += size;
    }
    expect(parts.length).toBe(whole.length);
    let maxDiff = 0;
    for (let j = 0; j < whole.length; j++) {
      maxDiff = Math.max(maxDiff, Math.abs((parts[j] ?? 0) - (whole[j] ?? 0)));
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });

  it('a un gain unitaire en continu', () => {
    const out = resampleSteady(new Float32Array(inputRate).fill(0.25), inputRate);
    for (const v of out) expect(v).toBeCloseTo(0.25, 3);
  });
});

describe('Resampler reset', () => {
  it('repart d’un état vierge', () => {
    const r = new Resampler(48_000, TARGET_SAMPLE_RATE);
    const input = sine(1_000, 48_000, 0.1);
    const first = r.process(input);
    r.reset();
    const second = r.process(input);
    expect(Array.from(second)).toEqual(Array.from(first));
  });
});
