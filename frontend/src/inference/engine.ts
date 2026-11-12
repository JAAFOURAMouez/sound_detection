// Moteur d'analyse du worker, indépendant des runtimes : fenêtrage, classification,
// score d'anomalie calibré, dérive. Les modèles sont injectés (testable avec des faux).

import { computeRms, toDbfs } from '../audio/level';
import { TARGET_SAMPLE_RATE } from '../audio/config';
import {
  type Baseline,
  Calibrator,
  ScoreSmoother,
  scoreSample,
  ThresholdGate,
} from './calibration';
import { DriftMonitor, type DriftState } from './drift';
import { type ClassScore, type Classification, classify, type FamilyTable } from './families';
import { SlidingWindow } from './windowing';

export interface ClassifierModel {
  readonly kind: 'yamnet' | 'cnn';
  readonly window: number;
  readonly table: FamilyTable;
  scores(samples: Float32Array): Promise<ClassScore[]> | ClassScore[];
}

export interface AnomalyModel {
  readonly window: number;
  analyse(samples: Float32Array): Promise<{ reconstruction: number; embedding: Float32Array }>;
}

export interface EngineOptions {
  hop: number;
  topK: number;
  minFamilyScore: number;
  confidentScore: number;
  /** Seuil en nombre de MAD (k). */
  k: number;
  smoothingAlpha: number;
  refractorySeconds: number;
}

export interface ClassificationEvent extends Classification {
  type: 'result';
  model: 'yamnet' | 'cnn';
  windowEndSample: number;
  inferenceMs: number;
}

export interface AnomalyEvent {
  type: 'anomaly';
  windowEndSample: number;
  /** Score brut normalisé dans [0, 1[ et score lissé (0,5 = seuil). */
  raw: number;
  score: number;
  zReconstruction: number;
  zEmbedding: number;
  levelDb: number;
  above: boolean;
  /** Vrai à la naissance d'une alerte (franchissement montant). */
  alert: boolean;
}

export type EngineEvent =
  | ClassificationEvent
  | AnomalyEvent
  | { type: 'calibration'; progress: number; done: boolean }
  | ({ type: 'drift'; windowEndSample: number } & DriftState);

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  hop: 8_000,
  topK: 3,
  minFamilyScore: 0.15,
  confidentScore: 0.5,
  k: 4,
  smoothingAlpha: 0.5,
  refractorySeconds: 2,
};

export class AnalysisEngine {
  private readonly opts: EngineOptions;
  private readonly emit: (event: EngineEvent) => void;
  private classifier: ClassifierModel | null = null;
  private anomaly: AnomalyModel | null = null;
  private classWindows: SlidingWindow | null = null;
  private anomalyWindows: SlidingWindow | null = null;
  private calibrator: Calibrator | null = null;
  private calibrationFamilies: string[] = [];
  private calibrationLevels: number[] = [];
  private baseline: Baseline | null = null;
  private drift: DriftMonitor | null = null;
  private readonly smoother: ScoreSmoother;
  private readonly gate: ThresholdGate;
  private lastFamily: string | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(emit: (event: EngineEvent) => void, options: Partial<EngineOptions> = {}) {
    this.opts = { ...DEFAULT_ENGINE_OPTIONS, ...options };
    this.emit = emit;
    this.smoother = new ScoreSmoother(this.opts.smoothingAlpha);
    this.gate = new ThresholdGate(0.5, this.opts.refractorySeconds);
  }

  get calibrated(): boolean {
    return this.baseline !== null;
  }

  setClassifier(model: ClassifierModel | null): void {
    this.classifier = model;
    this.classWindows = model ? new SlidingWindow(model.window, this.opts.hop) : null;
  }

  setAnomaly(model: AnomalyModel | null): void {
    this.anomaly = model;
    this.anomalyWindows = model ? new SlidingWindow(model.window, this.opts.hop) : null;
  }

  /** Démarre (ou relance) la calibration sur `seconds` secondes d'ambiance. */
  startCalibration(seconds: number): void {
    const windows = Math.max(20, Math.round((seconds * TARGET_SAMPLE_RATE) / this.opts.hop));
    this.calibrator = new Calibrator(windows);
    this.calibrationFamilies = [];
    this.calibrationLevels = [];
    this.baseline = null;
    this.drift = null;
    this.smoother.reset();
    this.gate.reset();
    this.emit({ type: 'calibration', progress: 0, done: false });
  }

  /** Vide les fenêtres en cours (nouvelle source, reprise après pause). */
  resetWindows(): void {
    this.classWindows = this.classifier
      ? new SlidingWindow(this.classifier.window, this.opts.hop)
      : null;
    this.anomalyWindows = this.anomaly
      ? new SlidingWindow(this.anomaly.window, this.opts.hop)
      : null;
    this.smoother.reset();
  }

  /** Ajoute un bloc 16 kHz ; le traitement est sérialisé pour garder l'ordre des fenêtres. */
  push(samples: Float32Array): Promise<void> {
    this.queue = this.queue.then(() => this.process(samples));
    return this.queue;
  }

  private async process(samples: Float32Array): Promise<void> {
    const classifier = this.classifier;
    if (classifier && this.classWindows) {
      for (const w of this.classWindows.push(samples)) {
        const t0 = performance.now();
        const scores = await classifier.scores(w.samples);
        const result = classify(scores, classifier.table, {
          topK: this.opts.topK,
          minFamilyScore: this.opts.minFamilyScore,
          confidentScore: this.opts.confidentScore,
        });
        this.lastFamily = result.dominant?.family ?? null;
        this.emit({
          type: 'result',
          model: classifier.kind,
          ...result,
          windowEndSample: w.endSample,
          inferenceMs: performance.now() - t0,
        });
      }
    }

    const anomaly = this.anomaly;
    if (anomaly && this.anomalyWindows) {
      for (const w of this.anomalyWindows.push(samples)) {
        const output = await anomaly.analyse(w.samples);
        const levelDb = toDbfs(computeRms(w.samples));
        this.handleAnomaly(output, levelDb, w.endSample);
      }
    }
  }

  private handleAnomaly(
    output: { reconstruction: number; embedding: Float32Array },
    levelDb: number,
    windowEndSample: number,
  ): void {
    const calibrator = this.calibrator;
    if (calibrator && !calibrator.complete) {
      calibrator.add(output);
      this.calibrationFamilies.push(this.lastFamily ?? 'none');
      this.calibrationLevels.push(levelDb);
      // `progress` plutôt que `complete` : la valeur vient de changer avec add().
      if (calibrator.progress >= 1) {
        this.baseline = calibrator.baseline();
        const levels = [...this.calibrationLevels].sort((a, b) => a - b);
        this.drift = new DriftMonitor({
          families: this.classifier?.table.families ?? [],
          labels: this.calibrationFamilies,
          levelDb: levels[Math.floor(levels.length / 2)] ?? -100,
        });
      }
      this.emit({ type: 'calibration', progress: calibrator.progress, done: calibrator.complete });
      return;
    }
    if (!this.baseline) return;

    const t = windowEndSample / TARGET_SAMPLE_RATE;
    const s = scoreSample(output, this.baseline, this.opts.k);
    const score = this.smoother.update(s.score);
    const alert = this.gate.update(score, t);
    this.emit({
      type: 'anomaly',
      windowEndSample,
      raw: s.score,
      score,
      zReconstruction: s.zReconstruction,
      zEmbedding: s.zEmbedding,
      levelDb,
      above: this.gate.isAbove,
      alert,
    });
    if (this.drift) {
      const state = this.drift.update({ t, family: this.lastFamily, levelDb });
      this.emit({ type: 'drift', windowEndSample, ...state });
    }
  }
}
