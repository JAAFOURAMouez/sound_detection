import { describe, expect, it } from 'vitest';
import { DriftMonitor, histogram, jensenShannon, NO_FAMILY } from './drift';

describe('jensenShannon', () => {
  it('vaut 0 pour deux distributions identiques et 1 pour deux disjointes', () => {
    expect(jensenShannon([0.5, 0.5], [0.5, 0.5])).toBe(0);
    expect(jensenShannon([1, 0], [0, 1])).toBeCloseTo(1);
  });

  it('est symétrique', () => {
    const p = [0.7, 0.2, 0.1];
    const q = [0.1, 0.3, 0.6];
    expect(jensenShannon(p, q)).toBeCloseTo(jensenShannon(q, p));
  });
});

describe('histogram', () => {
  it('compte, lisse et normalise', () => {
    const h = histogram(['a', 'a', 'b'], ['a', 'b', 'c'], 0);
    expect(h).toEqual([2 / 3, 1 / 3, 0]);
    expect(histogram([], ['a', 'b']).reduce((x, y) => x + y)).toBeCloseTo(1);
  });
});

const families = ['ambient', 'voice', 'mechanical'];
const calm = {
  families,
  labels: [...Array<string>(80).fill('ambient'), ...Array<string>(20).fill(NO_FAMILY)],
  levelDb: -55,
};

/** Alimente le moniteur toutes les 0,5 s de `from` à `to` (secondes). */
function feed(m: DriftMonitor, from: number, to: number, family: string | null, levelDb: number) {
  let state = m.update({ t: from, family, levelDb });
  for (let t = from + 0.5; t <= to; t += 0.5) state = m.update({ t, family, levelDb });
  return state;
}

describe('DriftMonitor', () => {
  it('ne signale rien tant que l’ambiance ressemble à la ligne de base', () => {
    const m = new DriftMonitor(calm);
    let state = feed(m, 0, 200, 'ambient', -55);
    for (let t = 200.5; t < 300; t += 0.5)
      state = m.update({ t, family: t % 5 === 0 ? null : 'ambient', levelDb: -54 });
    expect(state.drifting).toBe(false);
    expect(state.sustained).toBe(false);
  });

  it('détecte un changement de composition maintenu 30 s', () => {
    const m = new DriftMonitor(calm);
    feed(m, 0, 60, 'ambient', -55);
    // Un appareil mécanique se met à tourner en continu.
    const early = feed(m, 60.5, 100, 'mechanical', -55);
    expect(early.divergence).toBeGreaterThan(0.25);
    const late = feed(m, 100.5, 140, 'mechanical', -55);
    expect(late.drifting).toBe(true);
    expect(late.sustained).toBe(true);
  });

  it('détecte une hausse durable du niveau', () => {
    const m = new DriftMonitor(calm);
    feed(m, 0, 60, 'ambient', -55);
    const state = feed(m, 60.5, 260, 'ambient', -40);
    expect(state.levelDeltaDb).toBeCloseTo(15);
    expect(state.sustained).toBe(true);
  });

  it('ne juge pas avant une minute de données récentes', () => {
    const m = new DriftMonitor(calm);
    const state = feed(m, 0, 40, 'mechanical', -30);
    expect(state.drifting).toBe(false);
  });

  it('oublie un épisode bref', () => {
    const m = new DriftMonitor(calm);
    feed(m, 0, 120, 'ambient', -55);
    feed(m, 120.5, 125, 'mechanical', -40); // 5 s de bruit
    const state = feed(m, 125.5, 160, 'ambient', -55);
    expect(state.sustained).toBe(false);
  });
});
