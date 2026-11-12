// Dérive lente de l'ambiance (fonctions pures) : on compare l'histogramme des familles et le
// niveau sonore des 2 dernières minutes à ceux de la ligne de base. Une dérive maintenue 30 s
// est signalée sans alarme (gravité 0), avec une proposition de recalibrer.

export const NO_FAMILY = 'none';

/** Histogramme normalisé avec lissage additif (évite les probabilités nulles). */
export function histogram(
  labels: readonly string[],
  keys: readonly string[],
  smoothing = 0.5,
): number[] {
  const counts = keys.map((k) => labels.filter((l) => l === k).length + smoothing);
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => c / total);
}

/** Divergence de Jensen-Shannon en bits, dans [0, 1]. */
export function jensenShannon(p: readonly number[], q: readonly number[]): number {
  if (p.length !== q.length) throw new Error('Distributions de tailles différentes');
  let js = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] ?? 0;
    const b = q[i] ?? 0;
    const m = (a + b) / 2;
    if (a > 0) js += 0.5 * a * Math.log2(a / m);
    if (b > 0) js += 0.5 * b * Math.log2(b / m);
  }
  return Math.min(1, Math.max(0, js));
}

export interface DriftBaseline {
  families: readonly string[];
  /** Familles observées pendant la calibration (une par fenêtre, `none` si aucune). */
  labels: readonly string[];
  levelDb: number;
}

export interface DriftOptions {
  windowSeconds?: number;
  sustainSeconds?: number;
  /** Données récentes minimales avant de juger. */
  minSeconds?: number;
  jsThreshold?: number;
  levelThresholdDb?: number;
}

export interface DriftObservation {
  /** Horodatage en secondes. */
  t: number;
  family: string | null;
  levelDb: number;
}

export interface DriftState {
  divergence: number;
  levelDeltaDb: number;
  /** Condition de dérive remplie à l'instant. */
  drifting: boolean;
  /** Dérive maintenue au moins `sustainSeconds`. */
  sustained: boolean;
}

export class DriftMonitor {
  private readonly keys: string[];
  private readonly baselineHistogram: number[];
  private readonly baselineLevel: number;
  private readonly opts: Required<DriftOptions>;
  private readonly recent: DriftObservation[] = [];
  private driftSince: number | null = null;

  constructor(baseline: DriftBaseline, options: DriftOptions = {}) {
    this.opts = {
      windowSeconds: 120,
      sustainSeconds: 30,
      minSeconds: 60,
      jsThreshold: 0.25,
      levelThresholdDb: 8,
      ...options,
    };
    this.keys = [...new Set([...baseline.families, NO_FAMILY])];
    this.baselineHistogram = histogram(baseline.labels, this.keys);
    this.baselineLevel = baseline.levelDb;
  }

  update(obs: DriftObservation): DriftState {
    this.recent.push(obs);
    while (this.recent.length > 0 && (this.recent[0]?.t ?? 0) < obs.t - this.opts.windowSeconds) {
      this.recent.shift();
    }
    const span = obs.t - (this.recent[0]?.t ?? obs.t);
    const labels = this.recent.map((o) => o.family ?? NO_FAMILY);
    const divergence = jensenShannon(histogram(labels, this.keys), this.baselineHistogram);
    const levels = this.recent.map((o) => o.levelDb).sort((a, b) => a - b);
    const recentLevel = levels[Math.floor(levels.length / 2)] ?? this.baselineLevel;
    const levelDeltaDb = recentLevel - this.baselineLevel;

    const drifting =
      span >= this.opts.minSeconds &&
      (divergence >= this.opts.jsThreshold || Math.abs(levelDeltaDb) >= this.opts.levelThresholdDb);
    if (drifting) this.driftSince ??= obs.t;
    else this.driftSince = null;
    const sustained =
      this.driftSince !== null && obs.t - this.driftSince >= this.opts.sustainSeconds;
    return { divergence, levelDeltaDb, drifting, sustained };
  }
}
