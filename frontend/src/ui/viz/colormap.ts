// Palette perceptuelle sombre de type « magma » (points d'ancrage de la palette matplotlib, CC0).

const MAGMA_ANCHORS: readonly (readonly [number, number, number])[] = [
  [0, 0, 4],
  [28, 16, 68],
  [79, 18, 123],
  [129, 37, 129],
  [181, 54, 122],
  [229, 80, 100],
  [251, 135, 97],
  [254, 194, 135],
  [252, 253, 191],
];

/** Table RGBA de `size` entrées (Uint8ClampedArray de longueur 4 × size). */
export function buildColormap(size = 256): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(size * 4);
  const segments = MAGMA_ANCHORS.length - 1;
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * segments;
    const k = Math.min(segments - 1, Math.floor(t));
    const f = t - k;
    const a = MAGMA_ANCHORS[k] ?? [0, 0, 0];
    const b = MAGMA_ANCHORS[k + 1] ?? a;
    lut[i * 4] = a[0] + (b[0] - a[0]) * f;
    lut[i * 4 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 4 + 2] = a[2] + (b[2] - a[2]) * f;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

/** Normalise une valeur en dB dans [0, 1] entre `minDb` et `maxDb`. */
export function normalizeDb(db: number, minDb: number, maxDb: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - minDb) / (maxDb - minDb)));
}
