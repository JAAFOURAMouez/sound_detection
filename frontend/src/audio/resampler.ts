// Rééchantillonneur polyphasé à sinc fenêtrée (Kaiser), à état, sans dépendance au navigateur.
// Utilisé dans l'AudioWorklet ; testé sur sinusoïdes dans resampler.test.ts.

import { RESAMPLER_CUTOFF, RESAMPLER_KAISER_BETA, RESAMPLER_TAPS_PER_PHASE } from './config';

export interface ResamplerOptions {
  /** Longueur du filtre en échantillons d'entrée. */
  tapsPerPhase?: number;
  /** Coupure en fraction de la fréquence de Nyquist la plus basse (entrée ou sortie). */
  cutoff?: number;
  /** Paramètre beta de la fenêtre de Kaiser. */
  kaiserBeta?: number;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

/** Rapport rationnel réduit : sortie = entrée × up / down. */
export function rationalRatio(inputRate: number, outputRate: number): { up: number; down: number } {
  if (!Number.isInteger(inputRate) || !Number.isInteger(outputRate)) {
    throw new Error('Les fréquences doivent être entières');
  }
  if (inputRate <= 0 || outputRate <= 0) {
    throw new Error('Les fréquences doivent être positives');
  }
  const g = gcd(inputRate, outputRate);
  return { up: outputRate / g, down: inputRate / g };
}

/** Fonction de Bessel modifiée de première espèce, ordre 0 (série). */
export function besselI0(x: number): number {
  let sum = 1;
  let term = 1;
  const half = x / 2;
  for (let k = 1; k < 64; k++) {
    term *= (half / k) * (half / k);
    sum += term;
    if (term < sum * 1e-12) break;
  }
  return sum;
}

/**
 * Filtre prototype passe-bas à la cadence suréchantillonnée (entrée × up),
 * rangé par phase : coefficient de la phase p, prise j = table[p * taps + j].
 * Gain multiplié par `up` pour compenser l'insertion de zéros.
 */
function designPolyphase(
  up: number,
  down: number,
  taps: number,
  cutoff: number,
  beta: number,
): Float32Array {
  const length = taps * up;
  const center = (length - 1) / 2;
  // Coupure normalisée à la cadence suréchantillonnée (1 = Nyquist de cette cadence).
  const fc = cutoff / Math.max(up, down);
  const i0Beta = besselI0(beta);
  const prototype = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    const m = n - center;
    const x = fc * m;
    const sinc = m === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const r = (2 * n) / (length - 1) - 1;
    const window = besselI0(beta * Math.sqrt(Math.max(0, 1 - r * r))) / i0Beta;
    prototype[n] = fc * sinc * window * up;
  }
  const table = new Float32Array(length);
  for (let p = 0; p < up; p++) {
    for (let j = 0; j < taps; j++) {
      table[p * taps + j] = prototype[p + j * up] ?? 0;
    }
  }
  return table;
}

export class Resampler {
  readonly inputRate: number;
  readonly outputRate: number;
  readonly up: number;
  readonly down: number;
  readonly taps: number;
  private readonly table: Float32Array;
  /** Les `taps - 1` derniers échantillons d'entrée, du plus ancien au plus récent. */
  private history: Float32Array;
  /** Nombre total d'échantillons d'entrée reçus. */
  private inputCount = 0;
  /** Indice absolu du plus récent échantillon d'entrée utilisé par la prochaine sortie. */
  private nextBase = 0;
  /** Phase de la prochaine sortie, dans [0, up). */
  private nextPhase = 0;

  constructor(inputRate: number, outputRate: number, options: ResamplerOptions = {}) {
    const { up, down } = rationalRatio(inputRate, outputRate);
    this.inputRate = inputRate;
    this.outputRate = outputRate;
    this.up = up;
    this.down = down;
    this.taps = options.tapsPerPhase ?? RESAMPLER_TAPS_PER_PHASE;
    this.table = designPolyphase(
      up,
      down,
      this.taps,
      options.cutoff ?? RESAMPLER_CUTOFF,
      options.kaiserBeta ?? RESAMPLER_KAISER_BETA,
    );
    this.history = new Float32Array(this.taps - 1);
  }

  /** Retard introduit par le filtre, en échantillons de sortie (approximatif). */
  get latencySamples(): number {
    return Math.round(((this.taps - 1) / 2) * (this.outputRate / this.inputRate));
  }

  /** Traite un bloc d'entrée et renvoie les échantillons de sortie disponibles. */
  process(input: Float32Array): Float32Array {
    const taps = this.taps;
    const hist = taps - 1;
    const buffer = new Float32Array(hist + input.length);
    buffer.set(this.history, 0);
    buffer.set(input, hist);
    // Indice absolu de buffer[0].
    const bufferStart = this.inputCount - hist;
    const newCount = this.inputCount + input.length;

    const capacity = Math.ceil(((input.length + 1) * this.up) / this.down) + 1;
    const output = new Float32Array(capacity);
    let produced = 0;
    let base = this.nextBase;
    let phase = this.nextPhase;
    const table = this.table;

    while (base < newCount) {
      const offset = phase * taps;
      const newest = base - bufferStart;
      let acc = 0;
      // x[base - j] * h[phase + j * up] ; les indices négatifs (avant le début) valent 0.
      const jMax = Math.min(taps - 1, newest);
      for (let j = 0; j <= jMax; j++) {
        acc += (buffer[newest - j] ?? 0) * (table[offset + j] ?? 0);
      }
      output[produced++] = acc;
      phase += this.down;
      while (phase >= this.up) {
        phase -= this.up;
        base++;
      }
    }

    this.nextBase = base;
    this.nextPhase = phase;
    this.inputCount = newCount;
    this.history = buffer.slice(buffer.length - hist);
    return output.subarray(0, produced);
  }

  /** Remet le filtre à zéro (après une pause par exemple). */
  reset(): void {
    this.history.fill(0);
    this.inputCount = 0;
    this.nextBase = 0;
    this.nextPhase = 0;
  }
}
