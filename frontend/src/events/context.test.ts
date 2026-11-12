import { describe, expect, it } from 'vitest';
import type { Severity } from '../inference/families';
import { ContextTracker, summarize } from './context';
import type { Frame } from './types';

const frame = (t: number, family: string | null, levelDb: number): Frame => ({
  t,
  score: 0.1,
  levelDb,
  dominant: family ? { family, score: 0.5, severity: 0 as Severity } : null,
  top: [],
  drift: false,
});

describe('contexte de la minute', () => {
  it('résume familles, niveau moyen et stabilité', () => {
    const s = summarize([
      frame(0, 'ambient', -50),
      frame(500, 'ambient', -52),
      frame(1000, 'voice', -48),
      frame(1500, null, -50),
    ]);
    expect(s.families[0]).toEqual({ family: 'ambient', share: 0.5 });
    expect(s.meanLevelDb).toBe(-50);
    expect(s.levelStdDb).toBeCloseTo(Math.sqrt(2));
    expect(s.frames).toBe(4);
  });

  it('oublie ce qui a plus d’une minute et exclut l’instant de l’événement', () => {
    const tracker = new ContextTracker();
    for (let t = 0; t <= 90_000; t += 500)
      tracker.push(frame(t, t < 30_000 ? 'voice' : 'ambient', -50));
    const s = tracker.summary(90_000);
    expect(s.families.map((f) => f.family)).toEqual(['ambient']);
    expect(s.frames).toBe(120);
  });

  it('gère l’absence de données', () => {
    expect(summarize([])).toEqual({ families: [], meanLevelDb: null, levelStdDb: null, frames: 0 });
  });
});
