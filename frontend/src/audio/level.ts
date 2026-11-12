// Mesures de niveau, pures : RMS, crête, dBFS et lissage façon vu-mètre.

export const DB_FLOOR = -100;

export function computeRms(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

export function computePeak(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  }
  return peak;
}

/** Amplitude linéaire → dBFS (1,0 = 0 dBFS), bornée par `floor`. */
export function toDbfs(amplitude: number, floor = DB_FLOOR): number {
  if (!(amplitude > 0)) return floor;
  return Math.max(floor, 20 * Math.log10(amplitude));
}

export interface SmootherOptions {
  /** Constante de temps à la montée, en secondes. */
  attack: number;
  /** Constante de temps à la descente, en secondes. */
  release: number;
  floor?: number;
}

/** Lissage exponentiel asymétrique (montée rapide, descente lente), en dB. */
export class LevelSmoother {
  private value: number;
  private readonly attack: number;
  private readonly release: number;

  constructor({ attack, release, floor = DB_FLOOR }: SmootherOptions) {
    this.attack = attack;
    this.release = release;
    this.value = floor;
  }

  get current(): number {
    return this.value;
  }

  /** Avance de `dt` secondes vers la cible `db` et renvoie la valeur lissée. */
  step(db: number, dt: number): number {
    const tau = db > this.value ? this.attack : this.release;
    const alpha = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    this.value += alpha * (db - this.value);
    return this.value;
  }
}
