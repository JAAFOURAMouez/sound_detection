import { describe, expect, it } from 'vitest';
import { buildColormap, normalizeDb } from './colormap';

const luminance = (lut: Uint8ClampedArray, i: number) =>
  0.2126 * (lut[i * 4] ?? 0) + 0.7152 * (lut[i * 4 + 1] ?? 0) + 0.0722 * (lut[i * 4 + 2] ?? 0);

describe('colormap', () => {
  it('va du presque noir au jaune pâle', () => {
    const lut = buildColormap(256);
    expect(Array.from(lut.slice(0, 4))).toEqual([0, 0, 4, 255]);
    expect(Array.from(lut.slice(255 * 4))).toEqual([252, 253, 191, 255]);
  });

  it('a une luminance croissante (lecture sans ambiguïté)', () => {
    const lut = buildColormap(64);
    for (let i = 1; i < 64; i++)
      expect(luminance(lut, i)).toBeGreaterThanOrEqual(luminance(lut, i - 1));
  });

  it('normalise et borne les dB', () => {
    expect(normalizeDb(-100, -100, -20)).toBe(0);
    expect(normalizeDb(-60, -100, -20)).toBeCloseTo(0.5);
    expect(normalizeDb(0, -100, -20)).toBe(1);
    expect(normalizeDb(-Infinity, -100, -20)).toBe(0);
  });
});
