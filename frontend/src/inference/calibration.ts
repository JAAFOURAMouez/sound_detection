// Calibration locale du score d'anomalie (fonctions pures, voir docs/ARCHITECTURE.md).
//
// Pendant la calibration, on observe l'ambiance « normale » de la pièce : erreurs de
// reconstruction de l'autoencodeur et embeddings de son goulot. On en tire une ligne de base
// robuste (médiane, MAD, moyenne et variance des embeddings). En direct, chaque fenêtre reçoit
// deux scores normalisés z = (log x − médiane) / MAD, calculés sur le logarithme car erreurs et
// distances sont positives et très asymétriques ; on retient le plus grand (règle évaluée
// hors-ligne : ml/reports/autoencoder.md), puis s = z / (z + k) ∈ [0, 1[, si bien que le seuil
// « médiane + k × MAD » correspond exactement à s = 0,5.

export interface AnomalySample {
  /** Erreur de reconstruction de la fenêtre. */
  reconstruction: number;
  /** Embedding du goulot de l'autoencodeur. */
  embedding: ArrayLike<number>;
}

/** Statistiques calculées sur log(x + LOG_EPS). */
export const LOG_EPS = 1e-9;

const logOf = (x: number) => Math.log(Math.max(x, 0) + LOG_EPS);

export interface Baseline {
  /** Médiane et MAD de log(erreur de reconstruction). */
  recMedian: number;
  recMad: number;
  embMean: Float64Array;
  embVar: Float64Array;
  /** Médiane et MAD de log(distance des embeddings). */
  distMedian: number;
  distMad: number;
  windows: number;
}

export interface BaselineOptions {
  /** Variance minimale par dimension d'embedding (régularisation). */
  varianceFloor?: number;
  /** MAD minimale (en log, 0,05 ≈ 5 %) : évite l'hypersensibilité d'une scène trop stable. */
  madFloor?: number;
}

export const MIN_CALIBRATION_WINDOWS = 20;

export function median(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) throw new Error('Médiane d’un ensemble vide');
  const sorted = Float64Array.from(values).sort();
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Écart absolu médian (non mis à l'échelle). */
export function mad(values: ArrayLike<number>, center = median(values)): number {
  const deviations = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) deviations[i] = Math.abs((values[i] ?? 0) - center);
  return median(deviations);
}

function flooredMad(values: ArrayLike<number>, center: number, floor: number): number {
  return Math.max(mad(values, center), floor);
}

/** Distance de Mahalanobis diagonale au carré, moyennée par dimension. */
export function embeddingDistance(
  embedding: ArrayLike<number>,
  baseline: Pick<Baseline, 'embMean' | 'embVar'>,
): number {
  const dims = baseline.embMean.length;
  if (embedding.length !== dims) {
    throw new Error(`Embedding de taille ${String(embedding.length)}, attendu ${String(dims)}`);
  }
  let sum = 0;
  for (let i = 0; i < dims; i++) {
    const d = (embedding[i] ?? 0) - (baseline.embMean[i] ?? 0);
    sum += (d * d) / (baseline.embVar[i] ?? 1);
  }
  return sum / dims;
}

export function fitBaseline(
  samples: readonly AnomalySample[],
  options: BaselineOptions = {},
): Baseline {
  const opts: Required<BaselineOptions> = {
    varianceFloor: 1e-3,
    madFloor: 0.05,
    ...options,
  };
  if (samples.length < MIN_CALIBRATION_WINDOWS) {
    throw new Error(
      `Calibration trop courte : ${String(samples.length)} fenêtres (minimum ${String(MIN_CALIBRATION_WINDOWS)})`,
    );
  }
  const dims = samples[0]?.embedding.length ?? 0;
  const embMean = new Float64Array(dims);
  const embVar = new Float64Array(dims);
  for (const { embedding } of samples) {
    for (let i = 0; i < dims; i++)
      embMean[i] = (embMean[i] ?? 0) + (embedding[i] ?? 0) / samples.length;
  }
  for (const { embedding } of samples) {
    for (let i = 0; i < dims; i++) {
      const d = (embedding[i] ?? 0) - (embMean[i] ?? 0);
      embVar[i] = (embVar[i] ?? 0) + (d * d) / samples.length;
    }
  }
  for (let i = 0; i < dims; i++) embVar[i] = (embVar[i] ?? 0) + opts.varianceFloor;

  const rec = samples.map((s) => logOf(s.reconstruction));
  const recMedian = median(rec);
  const dist = samples.map((s) => logOf(embeddingDistance(s.embedding, { embMean, embVar })));
  const distMedian = median(dist);
  return {
    recMedian,
    recMad: flooredMad(rec, recMedian, opts.madFloor),
    embMean,
    embVar,
    distMedian,
    distMad: flooredMad(dist, distMedian, opts.madFloor),
    windows: samples.length,
  };
}

export interface AnomalyScore {
  zReconstruction: number;
  zEmbedding: number;
  /** Le plus grand des deux z. */
  z: number;
  /** Score normalisé dans [0, 1[ ; 0,5 = seuil. */
  score: number;
}

/** s = z / (z + k) pour z > 0, 0 sinon : le seuil médiane + k × MAD tombe à 0,5. */
export function normalizeZ(z: number, k: number): number {
  if (!(k > 0)) throw new Error('k doit être positif');
  return z > 0 ? z / (z + k) : 0;
}

export function scoreSample(sample: AnomalySample, baseline: Baseline, k: number): AnomalyScore {
  const zReconstruction = (logOf(sample.reconstruction) - baseline.recMedian) / baseline.recMad;
  const zEmbedding =
    (logOf(embeddingDistance(sample.embedding, baseline)) - baseline.distMedian) / baseline.distMad;
  const z = Math.max(zReconstruction, zEmbedding);
  return { zReconstruction, zEmbedding, z, score: normalizeZ(z, k) };
}

/** Moyenne exponentielle, montée immédiate optionnelle pour ne pas retarder une alerte. */
export class ScoreSmoother {
  private value: number | null = null;
  private readonly alpha: number;
  private readonly instantAttack: boolean;

  constructor(alpha: number, { instantAttack = false }: { instantAttack?: boolean } = {}) {
    if (!(alpha > 0 && alpha <= 1)) throw new Error('alpha doit être dans ]0, 1]');
    this.alpha = alpha;
    this.instantAttack = instantAttack;
  }

  get current(): number {
    return this.value ?? 0;
  }

  update(x: number): number {
    if (this.value === null || (this.instantAttack && x > this.value)) this.value = x;
    else this.value += this.alpha * (x - this.value);
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Accumule les fenêtres d'ambiance jusqu'à la durée voulue, puis livre la ligne de base. */
export class Calibrator {
  private readonly samples: AnomalySample[] = [];
  readonly targetWindows: number;

  constructor(targetWindows: number) {
    if (!Number.isInteger(targetWindows) || targetWindows < MIN_CALIBRATION_WINDOWS) {
      throw new Error(`Au moins ${String(MIN_CALIBRATION_WINDOWS)} fenêtres de calibration`);
    }
    this.targetWindows = targetWindows;
  }

  get progress(): number {
    return Math.min(1, this.samples.length / this.targetWindows);
  }

  get complete(): boolean {
    return this.samples.length >= this.targetWindows;
  }

  add(sample: AnomalySample): void {
    if (!this.complete) {
      this.samples.push({
        reconstruction: sample.reconstruction,
        embedding: Array.from(sample.embedding),
      });
    }
  }

  baseline(options?: BaselineOptions): Baseline {
    if (!this.complete) throw new Error('Calibration incomplète');
    return fitBaseline(this.samples, options);
  }
}
