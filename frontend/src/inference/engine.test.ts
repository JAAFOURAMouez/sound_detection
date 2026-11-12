import { describe, expect, it } from 'vitest';
import {
  type AnomalyModel,
  AnalysisEngine,
  type ClassifierModel,
  type EngineEvent,
} from './engine';
import { buildFamilyTable } from './families';

const table = buildFamilyTable({
  version: 1,
  model: 'test',
  families: { glass: { severity: 2 }, ambient: { severity: 0 }, other: { severity: 0 } },
  classes: { '0': { family: 'glass', name: 'Glass' }, '1': { family: 'ambient', name: 'Silence' } },
});

/** Faux classifieur : « verre » si l'amplitude crête dépasse 0,5. */
const classifier: ClassifierModel = {
  kind: 'cnn',
  window: 16_000,
  table,
  scores: (w) => {
    const loud = w.some((x) => Math.abs(x) > 0.5);
    return [
      { index: 0, name: 'Glass', score: loud ? 0.9 : 0.01 },
      { index: 1, name: 'Silence', score: loud ? 0.05 : 0.8 },
    ];
  },
};

/** Faux autoencodeur : l'erreur suit l'énergie, l'embedding aussi. */
const anomaly: AnomalyModel = {
  window: 16_000,
  analyse: (w) => {
    let energy = 0;
    for (const x of w) energy += x * x;
    energy /= w.length;
    return Promise.resolve({
      reconstruction: 0.02 + energy,
      embedding: Float32Array.of(energy * 10, 1),
    });
  },
};

function noise(seconds: number, amplitude: number, seed = 1): Float32Array {
  let a = seed;
  return Float32Array.from({ length: seconds * 16_000 }, () => {
    a = (a * 16807) % 2147483647;
    return amplitude * (a / 2147483647 - 0.5);
  });
}

async function feed(engine: AnalysisEngine, signal: Float32Array) {
  for (let i = 0; i < signal.length; i += 1_600) await engine.push(signal.subarray(i, i + 1_600));
}

function setup() {
  const events: EngineEvent[] = [];
  const engine = new AnalysisEngine((e) => events.push(e));
  engine.setClassifier(classifier);
  engine.setAnomaly(anomaly);
  return { engine, events };
}

describe('AnalysisEngine', () => {
  it('classe les fenêtres et publie la famille dominante', async () => {
    const { engine, events } = setup();
    await feed(engine, noise(2, 0.02));
    const results = events.filter((e) => e.type === 'result');
    expect(results.length).toBe(3); // 1 s puis toutes les 0,5 s
    expect(results[0]?.dominant?.family).toBe('ambient');
  });

  it('calibre, puis ne déclenche pas d’alerte sur la même ambiance', async () => {
    const { engine, events } = setup();
    engine.startCalibration(20);
    await feed(engine, noise(21, 0.02, 3));
    const calibration = events.filter((e) => e.type === 'calibration');
    expect(calibration.at(-1)).toMatchObject({ done: true, progress: 1 });
    expect(engine.calibrated).toBe(true);

    await feed(engine, noise(60, 0.02, 9));
    const anomalies = events.filter((e) => e.type === 'anomaly');
    expect(anomalies.length).toBeGreaterThan(100);
    expect(anomalies.filter((e) => e.alert)).toHaveLength(0);
  });

  it('déclenche une alerte quand un son fort survient après la calibration', async () => {
    const { engine, events } = setup();
    engine.startCalibration(20);
    await feed(engine, noise(21, 0.02, 3));
    const burst = noise(3, 0.02, 4);
    burst.set(noise(1, 1.8, 5), 16_000);
    await feed(engine, burst);
    const anomalies = events.filter((e) => e.type === 'anomaly');
    expect(anomalies.some((e) => e.alert)).toBe(true);
    expect(Math.max(...anomalies.map((e) => e.score))).toBeGreaterThan(0.5);
  });

  it('n’émet aucun score d’anomalie avant la calibration', async () => {
    const { engine, events } = setup();
    await feed(engine, noise(3, 0.5));
    expect(events.some((e) => e.type === 'anomaly')).toBe(false);
  });

  it('signale une dérive durable après calibration', async () => {
    const { engine, events } = setup();
    engine.startCalibration(20);
    await feed(engine, noise(21, 0.02, 3));
    // L'ambiance devient nettement plus forte pendant 3 minutes.
    await feed(engine, noise(180, 0.4, 6));
    const drift = events.filter((e) => e.type === 'drift');
    expect(drift.at(-1)?.sustained).toBe(true);
  });
});
