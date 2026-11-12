// Banc de filtres mel pour l'AFFICHAGE uniquement (spectrogramme).
// Les modèles calculent leur propre log-mel dans le graphe ONNX : ne jamais réutiliser ceci comme entrée.

export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

export function melToHz(mel: number): number {
  return 700 * (10 ** (mel / 2595) - 1);
}

export interface MelBand {
  /** Premier indice de case FFT couvert. */
  start: number;
  /** Poids triangulaires à partir de `start`. */
  weights: Float32Array;
}

/**
 * Filtres triangulaires répartis uniformément en mel entre `fMin` et `fMax`.
 * `binCount` = fftSize / 2 (sortie d'AnalyserNode), case k ↔ k × sampleRate / fftSize.
 */
export function buildMelFilterbank(
  binCount: number,
  sampleRate: number,
  bands: number,
  fMin: number,
  fMax: number,
): MelBand[] {
  const nyquist = sampleRate / 2;
  const top = Math.min(fMax, nyquist);
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(top);
  const binHz = nyquist / binCount;
  const edges = Array.from({ length: bands + 2 }, (_, i) =>
    melToHz(melMin + ((melMax - melMin) * i) / (bands + 1)),
  );

  const result: MelBand[] = [];
  for (let b = 0; b < bands; b++) {
    const left = edges[b] ?? 0;
    const center = edges[b + 1] ?? 0;
    const right = edges[b + 2] ?? 0;
    const start = Math.max(0, Math.floor(left / binHz));
    const end = Math.min(binCount - 1, Math.ceil(right / binHz));
    const weights = new Float32Array(end - start + 1);
    for (let k = start; k <= end; k++) {
      const f = k * binHz;
      let w = 0;
      if (f >= left && f <= center) w = (f - left) / Math.max(center - left, 1e-9);
      else if (f > center && f <= right) w = (right - f) / Math.max(right - center, 1e-9);
      weights[k - start] = w;
    }
    // Bandes plus étroites qu'une case FFT : on prend au moins la case la plus proche.
    if (weights.every((w) => w === 0)) {
      const nearest = Math.min(binCount - 1, Math.round(center / binHz));
      result.push({ start: nearest, weights: Float32Array.of(1) });
    } else {
      result.push({ start, weights });
    }
  }
  return result;
}

/**
 * Applique le banc à un spectre en dB (getFloatFrequencyData) et renvoie des dB par bande.
 * La moyenne est faite en puissance, pondérée par les filtres.
 */
export function applyFilterbank(
  spectrumDb: Float32Array,
  bank: MelBand[],
  out: Float32Array,
  floorDb: number,
): Float32Array {
  for (let b = 0; b < bank.length; b++) {
    const band = bank[b];
    if (!band) continue;
    let power = 0;
    let weightSum = 0;
    for (let i = 0; i < band.weights.length; i++) {
      const w = band.weights[i] ?? 0;
      const db = spectrumDb[band.start + i] ?? floorDb;
      if (w > 0 && Number.isFinite(db)) power += w * 10 ** (db / 10);
      weightSum += w;
    }
    out[b] =
      power > 0 && weightSum > 0 ? Math.max(floorDb, 10 * Math.log10(power / weightSum)) : floorDb;
  }
  return out;
}
