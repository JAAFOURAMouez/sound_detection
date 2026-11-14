import { describe, expect, it, vi } from 'vitest';
import type { Received } from '../inference/classifierClient';
import type { EventChange } from './engine';
import { EventRecorder } from './recorder';

function setup() {
  let t = 1_000_000;
  let id = 0;
  const store = {
    startSession: vi.fn(() => Promise.resolve()),
    endSession: vi.fn(() => Promise.resolve()),
    saveEvent: vi.fn(() => Promise.resolve()),
    recordScore: vi.fn(() => Promise.resolve()),
  };
  const recorder = new EventRecorder({
    store,
    now: () => t,
    newId: () => `id${String(++id)}`,
    clip: () => new Float32Array(48_000).fill(0.1),
  });
  const changes: EventChange[] = [];
  recorder.subscribe((c) => changes.push(...c));
  const advance = (ms: number) => {
    t += ms;
  };
  return { recorder, store, changes, advance };
}

const result = (
  family: string | null,
  score = 0.9,
  severity: 0 | 1 | 2 | 3 = 2,
): Received<'result'> => ({
  model: 'yamnet',
  top: family ? [{ index: 1, name: family, score, family }] : [],
  families: [],
  dominant: family ? { family, score, severity } : null,
  windowEndSample: 0,
  inferenceMs: 1,
  receivedAt: 0,
});

const anomaly = (score: number): Received<'anomaly'> => ({
  windowEndSample: 0,
  raw: score,
  score,
  zReconstruction: 0,
  zEmbedding: 0,
  levelDb: -40,
  above: score >= 0.5,
  alert: false,
  receivedAt: 0,
});

describe('EventRecorder', () => {
  it('crée, persiste et clôt un événement inconnu, avec son extrait audio en mémoire', async () => {
    const { recorder, store, changes, advance } = setup();
    recorder.startSession('demo', 'yamnet');
    for (const s of [0.1, 0.1, 0.8, 0.6, 0.1, 0.1]) {
      recorder.onAnomaly(anomaly(s));
      advance(500);
    }
    await recorder.flush();
    expect(changes.map((c) => c.kind)).toEqual(['opened', 'updated', 'closed']);
    const closed = changes.at(-1)?.event;
    expect(closed).toMatchObject({ type: 'unknown', scoreMax: 0.8, closed: true });
    expect(store.saveEvent).toHaveBeenCalledTimes(3);
    expect(recorder.clips.get(closed?.id ?? '')?.length).toBe(48_000);
    // Score à 1 Hz : 6 trames sur 3 s → 3 enregistrements.
    expect(store.recordScore).toHaveBeenCalledTimes(3);
  });

  it('se cadence sur la classification quand l’anomalie ne parle pas', () => {
    const { recorder, changes, advance } = setup();
    recorder.startSession('mic', 'yamnet');
    recorder.onResult(result('glass'));
    advance(500);
    recorder.onResult(result(null));
    advance(500);
    recorder.onResult(result(null));
    expect(changes.map((c) => [c.kind, c.event.type, c.event.family])).toEqual([
      ['opened', 'known', 'glass'],
      ['closed', 'known', 'glass'],
    ]);
  });

  it('ignore la classification comme horloge quand l’anomalie arrive', () => {
    const { recorder, changes } = setup();
    recorder.startSession('mic', 'yamnet');
    recorder.onAnomaly(anomaly(0.1));
    recorder.onResult(result('glass'));
    expect(changes).toEqual([]);
    recorder.onAnomaly(anomaly(0.2));
    expect(changes[0]).toMatchObject({ kind: 'opened', event: { family: 'glass' } });
  });

  it('clôt l’événement ouvert à la fin de la session et ne fait rien hors session', async () => {
    const { recorder, store, changes } = setup();
    recorder.onAnomaly(anomaly(0.9));
    expect(changes).toEqual([]);
    recorder.startSession('mic', 'yamnet');
    recorder.onAnomaly(anomaly(0.9));
    recorder.endSession();
    await recorder.flush();
    expect(changes.at(-1)).toMatchObject({ kind: 'closed' });
    expect(store.endSession).toHaveBeenCalled();
  });

  it('émet un événement de dérive quand elle est maintenue', () => {
    const { recorder, changes } = setup();
    recorder.startSession('mic', 'yamnet');
    recorder.onDrift({
      windowEndSample: 0,
      divergence: 0.4,
      levelDeltaDb: 9,
      drifting: true,
      sustained: true,
      receivedAt: 0,
    });
    recorder.onAnomaly(anomaly(0.1));
    expect(changes[0]?.event.type).toBe('drift');
  });
});

describe('sourdine pendant la parole de l’assistant', () => {
  it('ignore les trames pendant la sourdine, puis reprend', () => {
    const { recorder, changes, advance } = setup();
    recorder.startSession('mic', 'yamnet');
    recorder.setMuted(true);
    expect(recorder.muted).toBe(true);
    for (const s of [0.9, 0.9, 0.9]) {
      recorder.onAnomaly(anomaly(s));
      advance(500);
    }
    expect(changes).toEqual([]);
    recorder.setMuted(false);
    recorder.onAnomaly(anomaly(0.9));
    expect(changes.map((c) => c.kind)).toEqual(['opened']);
  });
});
