import { describe, expect, it } from 'vitest';
import { applyFilterbank, buildMelFilterbank, hzToMel, melToHz } from './melScale';

describe('échelle mel', () => {
  it('convertit dans les deux sens', () => {
    for (const hz of [0, 100, 1_000, 4_000, 8_000]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 6);
    }
    expect(hzToMel(1_000)).toBeCloseTo(1_000, -1);
  });
});

describe('buildMelFilterbank', () => {
  const bank = buildMelFilterbank(1_024, 48_000, 64, 0, 8_000);

  it('crée le nombre de bandes demandé, aucune vide', () => {
    expect(bank).toHaveLength(64);
    for (const band of bank) {
      expect(Math.max(...band.weights)).toBeGreaterThan(0);
    }
  });

  it('ne dépasse pas 8 kHz', () => {
    const binHz = 24_000 / 1_024;
    const last = bank.at(-1);
    expect(last).toBeDefined();
    if (last)
      expect((last.start + last.weights.length - 1) * binHz).toBeLessThanOrEqual(8_000 + binHz);
  });

  it('place les bandes dans l’ordre croissant des fréquences', () => {
    for (let i = 1; i < bank.length; i++) {
      expect(bank[i]?.start ?? 0).toBeGreaterThanOrEqual(bank[i - 1]?.start ?? 0);
    }
  });
});

describe('applyFilterbank', () => {
  it('fait ressortir la bande d’un ton pur', () => {
    const binCount = 1_024;
    const sampleRate = 48_000;
    const bank = buildMelFilterbank(binCount, sampleRate, 32, 0, 8_000);
    const spectrum = new Float32Array(binCount).fill(-120);
    const toneBin = Math.round(2_000 / (sampleRate / 2 / binCount));
    spectrum[toneBin] = -20;
    const out = applyFilterbank(spectrum, bank, new Float32Array(32), -100);
    const loudest = out.indexOf(Math.max(...out));
    // La bande la plus forte doit contenir 2 kHz.
    const band = bank[loudest];
    expect(band).toBeDefined();
    if (band) {
      expect(toneBin).toBeGreaterThanOrEqual(band.start);
      expect(toneBin).toBeLessThan(band.start + band.weights.length);
    }
  });

  it('renvoie le plancher pour un spectre silencieux (−Infinity)', () => {
    const bank = buildMelFilterbank(256, 16_000, 8, 0, 8_000);
    const out = applyFilterbank(
      new Float32Array(256).fill(-Infinity),
      bank,
      new Float32Array(8),
      -100,
    );
    expect(Array.from(out)).toEqual(new Array(8).fill(-100));
  });
});
