import { describe, expect, it } from 'vitest';
import type { Severity } from '../inference/families';
import { type EngineState, type EventChange, initialEngineState, step } from './engine';
import type { Frame } from './types';

/** Scénario : une trame toutes les 0,5 s. */
function frames(spec: Partial<Frame>[], t0 = 1_000_000): Frame[] {
  return spec.map((s, i) => ({
    t: t0 + i * 500,
    score: 0.1,
    levelDb: -50,
    dominant: { family: 'ambient', score: 0.4, severity: 0 as Severity },
    top: [],
    drift: false,
    ...s,
  }));
}

function run(scenario: Frame[]) {
  let state: EngineState = initialEngineState;
  let n = 0;
  const changes: EventChange[] = [];
  for (const f of scenario) {
    const r = step(state, f, {
      sessionId: 's',
      newId: () => `e${String(++n)}`,
      context: () => ({ families: [], meanLevelDb: -50, levelStdDb: 1, frames: 10 }),
    });
    state = r.state;
    changes.push(...r.changes);
  }
  const closed = changes.filter((c) => c.kind === 'closed').map((c) => c.event);
  const opened = changes.filter((c) => c.kind === 'opened').map((c) => c.event);
  return { state, changes, closed, opened };
}

const calm = (n: number): Partial<Frame>[] => Array.from({ length: n }, () => ({}));
const glass = { family: 'glass', score: 0.9, severity: 2 as Severity };

describe('moteur d’événements', () => {
  it('ne produit rien sur une ambiance calme', () => {
    expect(run(frames(calm(240))).changes).toEqual([]);
  });

  it('ouvre un événement connu sur une famille critique, dès la première trame', () => {
    const r = run(
      frames([
        ...calm(4),
        { dominant: glass, score: 0.3 },
        { dominant: glass, score: 0.6 },
        ...calm(4),
      ]),
    );
    expect(r.opened).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({
      kind: 'opened',
      event: { type: 'known', family: 'glass', severity: 2 },
    });
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]).toMatchObject({ scoreMax: 0.6, confidence: 0.9, closed: true });
    expect((r.closed[0]?.end ?? 0) - (r.closed[0]?.start ?? 0)).toBe(500);
  });

  it('ouvre un événement inconnu sur un pic d’anomalie sans classe fiable', () => {
    const r = run(frames([...calm(4), { score: 0.7 }, ...calm(4)]));
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]).toMatchObject({
      type: 'unknown',
      family: null,
      severity: 1,
      scoreMax: 0.7,
    });
  });

  it('requalifie un événement inconnu quand la famille est reconnue ensuite', () => {
    const r = run(
      frames([...calm(2), { score: 0.7 }, { score: 0.8, dominant: glass }, ...calm(3)]),
    );
    expect(r.opened[0]?.type).toBe('unknown');
    expect(r.closed[0]).toMatchObject({ type: 'known', family: 'glass' });
  });

  it('nomme une anomalie dont la famille bénigne est reconnue, sans la rendre plus grave', () => {
    const cat = { family: 'animal', score: 0.8, severity: 0 as Severity };
    const r = run(frames([...calm(2), { score: 0.7 }, { score: 0.8, dominant: cat }, ...calm(3)]));
    expect(r.opened[0]?.type).toBe('unknown');
    expect(r.closed[0]).toMatchObject({
      type: 'known',
      family: 'animal',
      severity: 1,
      confidence: 0.8,
    });
  });

  it('ne nomme pas une anomalie d’après le fond sonore ni une famille peu sûre', () => {
    const r = run(
      frames([
        ...calm(2),
        { score: 0.7, dominant: { family: 'ambient', score: 0.9, severity: 0 as Severity } },
        { score: 0.8, dominant: { family: 'animal', score: 0.3, severity: 0 as Severity } },
        ...calm(3),
      ]),
    );
    expect(r.closed[0]).toMatchObject({ type: 'unknown', family: null });
  });

  it('fusionne deux pics séparés de 1,5 s', () => {
    // pic, 2 trames calmes (fermeture), 1 trame calme, pic : 1,5 s entre fin et reprise.
    const r = run(frames([...calm(2), { score: 0.8 }, ...calm(3), { score: 0.7 }, ...calm(4)]));
    expect(r.opened).toHaveLength(1);
    expect(r.closed.at(-1)?.id).toBe(r.opened[0]?.id);
    expect(r.closed.at(-1)?.scoreMax).toBe(0.8);
  });

  it('sépare deux pics distants de 3 s', () => {
    const r = run(frames([...calm(2), { score: 0.8 }, ...calm(6), { score: 0.7 }, ...calm(4)]));
    expect(r.opened).toHaveLength(2);
  });

  it('ne bat pas quand le score oscille autour du seuil (hystérésis)', () => {
    const oscillating = Array.from({ length: 20 }, (_, i) => ({
      score: i % 2 === 0 ? 0.52 : 0.45,
    }));
    const r = run(frames([...calm(2), ...oscillating, ...calm(4)]));
    expect(r.opened).toHaveLength(1);
    expect(r.closed).toHaveLength(1);
  });

  it('garde ouvert entre les deux seuils, puis ferme après deux trames calmes', () => {
    const r = run(frames([{ score: 0.6 }, { score: 0.45 }, { score: 0.45 }, { score: 0.2 }]));
    expect(r.closed).toHaveLength(0);
    const r2 = run(frames([{ score: 0.6 }, { score: 0.45 }, { score: 0.2 }, { score: 0.2 }]));
    expect(r2.closed).toHaveLength(1);
  });

  it('émet un seul événement de dérive par épisode, de gravité 0', () => {
    const r = run(
      frames([
        ...calm(2),
        ...Array.from({ length: 10 }, () => ({ drift: true })),
        ...calm(2),
        { drift: true },
      ]),
    );
    const drifts = r.opened.filter((e) => e.type === 'drift');
    expect(drifts).toHaveLength(2);
    expect(drifts[0]).toMatchObject({ severity: 0, closed: true });
  });

  it('ignore une famille critique peu confiante', () => {
    const r = run(frames([...calm(2), { dominant: { ...glass, score: 0.3 } }, ...calm(2)]));
    expect(r.changes).toEqual([]);
  });

  it('fonctionne sans autoencodeur (score nul)', () => {
    const r = run(
      frames([{ score: null }, { score: null, dominant: glass }, { score: null }, { score: null }]),
    );
    expect(r.closed).toHaveLength(1);
    expect(r.closed[0]?.scoreMax).toBeNull();
  });
});
