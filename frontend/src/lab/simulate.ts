// Banc d'essai hors temps réel, chargé seulement dans le build de test (VITE_E2E) :
// décode une ambiance, y injecte des sons à un niveau choisi, rééchantillonne avec le même
// filtre que le worklet, puis fait passer le tout par le vrai worker d'inférence
// (YAMNet, autoencodeur ONNX via onnxruntime-web, calibration, seuil).

import { TARGET_SAMPLE_RATE, WORKLET_CHUNK_SAMPLES } from '../audio/config';
import { computeRms } from '../audio/level';
import { Resampler } from '../audio/resampler';
import { ClassifierClient, type Received } from '../inference/classifierClient';

const DECODE_RATE = 48_000;

export interface Injection {
  url: string;
  /** Instant d'injection (s) dans la piste simulée. */
  atSeconds: number;
  /** Niveau RMS du son injecté par rapport à l'ambiance (dB). */
  snrDb: number;
}

export interface SimulationOptions {
  ambienceUrl: string;
  /** Nombre de répétitions de l'ambiance (l'enregistrement dure 4 min 19 s). */
  loops: number;
  calibrationSeconds: number;
  injections?: Injection[];
  /** Fenêtre (s) après une injection pendant laquelle une alerte lui est attribuée. */
  attributionSeconds?: number;
}

export interface SimulationReport {
  durationSeconds: number;
  monitoredSeconds: number;
  windows: number;
  alerts: number[];
  falseAlerts: number[];
  falseAlertsPer10Min: number;
  maxScoreOutsideInjections: number;
  /** Score brut (non lissé) hors injections : maximum et nombre de fenêtres au-dessus de 0,5. */
  maxRawOutsideInjections: number;
  rawAboveOutsideInjections: number;
  /**
   * Référence « détecteur d'énergie » (non utilisé par l'application) : écart de niveau en
   * nombre de MAD par rapport aux fenêtres hors injections. Sert à situer l'autoencodeur.
   */
  levelZMaxOutsideInjections: number;
  injections: {
    atSeconds: number;
    snrDb: number;
    maxScore: number;
    maxRaw: number;
    levelZMax: number;
    alertAfterSeconds: number | null;
  }[];
  loadMs: number;
  wallSeconds: number;
}

async function decode(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Introuvable : ${url}`);
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
  const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++)
      mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / buffer.numberOfChannels;
  }
  return mono;
}

/** Partie sonore d'un échantillon (sans le silence ajouté autour). */
function trimSilence(x: Float32Array, thresholdDb = -50): Float32Array {
  const limit = 10 ** (thresholdDb / 20);
  let start = 0;
  let end = x.length;
  while (start < end && Math.abs(x[start] ?? 0) < limit) start++;
  while (end > start && Math.abs(x[end - 1] ?? 0) < limit) end--;
  return x.subarray(start, end);
}

export async function simulate(options: SimulationOptions): Promise<SimulationReport> {
  const t0 = performance.now();
  const attribution = options.attributionSeconds ?? 4;
  const ambience = await decode(options.ambienceUrl);
  const track = new Float32Array(ambience.length * options.loops);
  for (let i = 0; i < options.loops; i++) track.set(ambience, i * ambience.length);
  const ambienceRms = computeRms(ambience);

  for (const injection of options.injections ?? []) {
    const sound = trimSilence(await decode(injection.url));
    const gain = (ambienceRms * 10 ** (injection.snrDb / 20)) / Math.max(computeRms(sound), 1e-9);
    const offset = Math.round(injection.atSeconds * DECODE_RATE);
    for (let i = 0; i < sound.length && offset + i < track.length; i++) {
      track[offset + i] = (track[offset + i] ?? 0) + (sound[i] ?? 0) * gain;
    }
  }

  const resampled = new Resampler(DECODE_RATE, TARGET_SAMPLE_RATE).process(track);
  const client = new ClassifierClient();
  const info = await client.load(
    new URL(import.meta.env.BASE_URL, window.location.href).toString(),
    'yamnet',
  );
  const anomalies: Received<'anomaly'>[] = [];
  const hop = TARGET_SAMPLE_RATE / 2;
  const expectedLast =
    Math.floor((resampled.length - TARGET_SAMPLE_RATE) / hop) * hop + TARGET_SAMPLE_RATE;
  const finished = new Promise<void>((resolve) => {
    client.on('anomaly', (a) => {
      anomalies.push(a);
      if (a.windowEndSample >= expectedLast) resolve();
    });
  });
  client.calibrate(options.calibrationSeconds);
  for (let i = 0; i < resampled.length; i += WORKLET_CHUNK_SAMPLES) {
    client.push(resampled.subarray(i, i + WORKLET_CHUNK_SAMPLES));
  }
  await finished;
  client.dispose();

  const time = (a: Received<'anomaly'>) => a.windowEndSample / TARGET_SAMPLE_RATE;
  const injections = options.injections ?? [];
  const attributed = (t: number) =>
    injections.some((inj) => t >= inj.atSeconds && t <= inj.atSeconds + attribution);
  const alerts = anomalies.filter((a) => a.alert).map(time);
  const falseAlerts = alerts.filter((t) => !attributed(t));
  const monitoredSeconds = resampled.length / TARGET_SAMPLE_RATE - options.calibrationSeconds;
  const outside = anomalies.filter((a) => !attributed(time(a)));
  const levels = outside.map((a) => a.levelDb).sort((a, b) => a - b);
  const levelMedian = levels[Math.floor(levels.length / 2)] ?? 0;
  const deviations = levels.map((l) => Math.abs(l - levelMedian)).sort((a, b) => a - b);
  const levelMad = Math.max(deviations[Math.floor(deviations.length / 2)] ?? 0, 0.5);
  const levelZ = (a: Received<'anomaly'>) => (a.levelDb - levelMedian) / levelMad;
  return {
    durationSeconds: resampled.length / TARGET_SAMPLE_RATE,
    monitoredSeconds,
    windows: anomalies.length,
    alerts,
    falseAlerts,
    falseAlertsPer10Min: (falseAlerts.length / monitoredSeconds) * 600,
    maxScoreOutsideInjections: Math.max(0, ...outside.map((a) => a.score)),
    maxRawOutsideInjections: Math.max(0, ...outside.map((a) => a.raw)),
    rawAboveOutsideInjections: outside.filter((a) => a.raw >= 0.5).length,
    levelZMaxOutsideInjections: Math.max(0, ...outside.map(levelZ)),
    injections: injections.map((inj) => {
      const during = anomalies.filter(
        (a) => time(a) >= inj.atSeconds && time(a) <= inj.atSeconds + attribution,
      );
      const first = during.find((a) => a.alert);
      return {
        atSeconds: inj.atSeconds,
        snrDb: inj.snrDb,
        maxScore: Math.max(0, ...during.map((a) => a.score)),
        maxRaw: Math.max(0, ...during.map((a) => a.raw)),
        levelZMax: Math.max(0, ...during.map(levelZ)),
        alertAfterSeconds: first ? time(first) - inj.atSeconds : null,
      };
    }),
    loadMs: info.loadMs,
    wallSeconds: (performance.now() - t0) / 1000,
  };
}
