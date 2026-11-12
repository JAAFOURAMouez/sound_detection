import { describe, expect, it } from 'vitest';
import {
  type AnomalySample,
  Calibrator,
  embeddingDistance,
  fitBaseline,
  mad,
  median,
  normalizeZ,
  ScoreSmoother,
  scoreSample,
} from './calibration';

/** Générateur pseudo-aléatoire déterministe (mulberry32) et gaussienne (Box-Muller). */
function rng(seed: number) {
  let a = seed;
  const uniform = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () =>
    Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
  return { uniform, gauss };
}

function ambience(n: number, seed = 1, dims = 8): AnomalySample[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({
    reconstruction: 0.03 + 0.003 * r.gauss(),
    embedding: Array.from({ length: dims }, (_, i) => i * 0.1 + 0.05 * r.gauss()),
  }));
}

describe('statistiques robustes', () => {
  it('médiane et MAD', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(mad([1, 1, 2, 2, 4, 6, 9])).toBe(1);
    expect(() => median([])).toThrow();
  });

  it('la MAD résiste aux valeurs aberrantes', () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(mad([1, 2, 3, 4, 500]));
  });
});

describe('fitBaseline', () => {
  it('estime la ligne de base d’une ambiance stationnaire', () => {
    const b = fitBaseline(ambience(120));
    expect(Math.exp(b.recMedian)).toBeCloseTo(0.03, 2);
    expect(b.embMean[3]).toBeCloseTo(0.3, 1);
    expect(b.embVar[0]).toBeGreaterThan(0.002);
    expect(b.windows).toBe(120);
  });

  it('refuse une calibration trop courte', () => {
    expect(() => fitBaseline(ambience(5))).toThrow('trop courte');
  });

  it('borne la MAD d’une scène parfaitement constante', () => {
    const flat = Array.from({ length: 30 }, () => ({ reconstruction: 0.02, embedding: [1, 1] }));
    const b = fitBaseline(flat);
    expect(b.recMad).toBe(0.05); // plancher : 5 % en log
    expect(Number.isFinite(scoreSample({ reconstruction: 0.021, embedding: [1, 1] }, b, 4).z)).toBe(
      true,
    );
  });
});

describe('scoreSample', () => {
  const baseline = fitBaseline(ambience(120));

  it('donne un score bas pour de nouvelles fenêtres de la même ambiance', () => {
    const scores = ambience(200, 7).map((s) => scoreSample(s, baseline, 4).score);
    const above = scores.filter((s) => s >= 0.5).length;
    expect(above / scores.length).toBeLessThan(0.02);
  });

  it('dépasse le seuil quand la reconstruction devient mauvaise', () => {
    const s = scoreSample(
      { reconstruction: 0.08, embedding: ambience(1, 3)[0]?.embedding ?? [] },
      baseline,
      4,
    );
    expect(s.zReconstruction).toBeGreaterThan(4);
    expect(s.score).toBeGreaterThan(0.5);
  });

  it('dépasse le seuil quand l’embedding s’éloigne, même si la reconstruction est normale', () => {
    const shifted = Array.from({ length: 8 }, (_, i) => i * 0.1 + 0.6);
    const s = scoreSample({ reconstruction: 0.03, embedding: shifted }, baseline, 4);
    expect(s.zEmbedding).toBeGreaterThan(4);
    expect(s.z).toBe(s.zEmbedding);
    expect(s.score).toBeGreaterThan(0.5);
  });

  it('vérifie la dimension des embeddings', () => {
    expect(() => embeddingDistance([1, 2], baseline)).toThrow('taille');
  });
});

describe('normalizeZ', () => {
  it('place le seuil k à 0,5 et reste dans [0, 1[', () => {
    expect(normalizeZ(4, 4)).toBe(0.5);
    expect(normalizeZ(-3, 4)).toBe(0);
    expect(normalizeZ(1e6, 4)).toBeLessThan(1);
    expect(normalizeZ(8, 4)).toBeGreaterThan(normalizeZ(6, 4));
    expect(() => normalizeZ(1, 0)).toThrow();
  });
});

describe('ScoreSmoother', () => {
  it('lisse les variations et réagit immédiatement à une hausse si demandé', () => {
    const slow = new ScoreSmoother(0.2);
    slow.update(0);
    expect(slow.update(1)).toBeCloseTo(0.2);
    const fast = new ScoreSmoother(0.2, { instantAttack: true });
    fast.update(0);
    expect(fast.update(0.9)).toBe(0.9);
    expect(fast.update(0)).toBeCloseTo(0.72);
  });
});

describe('Calibrator', () => {
  it('suit la progression et livre la ligne de base', () => {
    const c = new Calibrator(40);
    const samples = ambience(50);
    samples.slice(0, 20).forEach((s) => {
      c.add(s);
    });
    expect(c.progress).toBe(0.5);
    expect(() => c.baseline()).toThrow('incomplète');
    samples.slice(20).forEach((s) => {
      c.add(s);
    });
    expect(c.complete).toBe(true);
    expect(c.baseline().windows).toBe(40);
  });
});
