import { describe, expect, it } from 'vitest';
import { sine } from '../test/signals';
import { computePeak, computeRms, DB_FLOOR, LevelSmoother, toDbfs } from './level';

describe('niveau', () => {
  it('une sinusoïde pleine échelle vaut −3,01 dBFS en RMS et 0 dBFS en crête', () => {
    const s = sine(1_000, 16_000, 1);
    expect(toDbfs(computeRms(s))).toBeCloseTo(-3.0103, 2);
    expect(toDbfs(computePeak(s))).toBeCloseTo(0, 2);
  });

  it('diviser l’amplitude par deux retire 6,02 dB', () => {
    const full = toDbfs(computeRms(sine(440, 16_000, 1, 1)));
    const half = toDbfs(computeRms(sine(440, 16_000, 1, 0.5)));
    expect(full - half).toBeCloseTo(6.0206, 2);
  });

  it('le silence et les cas vides tombent au plancher', () => {
    expect(toDbfs(computeRms(new Float32Array(128)))).toBe(DB_FLOOR);
    expect(computeRms([])).toBe(0);
    expect(toDbfs(Number.NaN)).toBe(DB_FLOOR);
    expect(toDbfs(1e-9, -60)).toBe(-60);
  });
});

describe('LevelSmoother', () => {
  it('monte vite et redescend lentement', () => {
    const s = new LevelSmoother({ attack: 0.01, release: 0.5 });
    // 50 ms à −10 dB : quasiment atteint grâce à l’attaque rapide.
    for (let i = 0; i < 5; i++) s.step(-10, 0.01);
    expect(s.current).toBeGreaterThan(-11);
    // 50 ms de silence : la descente reste lente.
    for (let i = 0; i < 5; i++) s.step(DB_FLOOR, 0.01);
    expect(s.current).toBeGreaterThan(-20);
  });

  it('suit immédiatement si la constante de temps est nulle', () => {
    const s = new LevelSmoother({ attack: 0, release: 0 });
    expect(s.step(-42, 0.016)).toBe(-42);
  });
});
