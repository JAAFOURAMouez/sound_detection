import { describe, expect, it } from 'vitest';
import { SlidingWindow } from './windowing';

const ramp = (from: number, n: number) => Float32Array.from({ length: n }, (_, i) => from + i);

function feed(w: SlidingWindow, total: number, chunk: number) {
  const out = [];
  for (let i = 0; i < total; i += chunk) out.push(...w.push(ramp(i, Math.min(chunk, total - i))));
  return out;
}

describe('SlidingWindow', () => {
  it('attend une fenêtre complète puis avance d’un pas', () => {
    const windows = feed(new SlidingWindow(10, 4), 22, 3);
    expect(windows.map((w) => w.endSample)).toEqual([10, 14, 18, 22]);
    expect(Array.from(windows[0]?.samples ?? [])).toEqual(Array.from(ramp(0, 10)));
    expect(Array.from(windows[3]?.samples ?? [])).toEqual(Array.from(ramp(12, 10)));
  });

  it('ne dépend pas de la taille des blocs', () => {
    const a = feed(new SlidingWindow(15_600, 8_000), 48_000, 1_600);
    const b = feed(new SlidingWindow(15_600, 8_000), 48_000, 7_777);
    expect(a.map((w) => w.endSample)).toEqual(b.map((w) => w.endSample));
    expect(a.at(-1)?.samples).toEqual(b.at(-1)?.samples);
    // 0,975 s puis toutes les 0,5 s sur 3 s : 5 fenêtres.
    expect(a).toHaveLength(5);
  });

  it('produit plusieurs fenêtres pour un gros bloc', () => {
    const w = new SlidingWindow(4, 2);
    expect(w.push(ramp(0, 10)).map((x) => x.endSample)).toEqual([4, 6, 8, 10]);
  });

  it('repart de zéro après reset', () => {
    const w = new SlidingWindow(4, 2);
    w.push(ramp(0, 5));
    w.reset();
    expect(w.push(ramp(100, 4)).map((x) => Array.from(x.samples))).toEqual([[100, 101, 102, 103]]);
  });

  it('refuse des paramètres invalides', () => {
    expect(() => new SlidingWindow(0, 1)).toThrow();
    expect(() => new SlidingWindow(10, 2.5)).toThrow();
  });
});
