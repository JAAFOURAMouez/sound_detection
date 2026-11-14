import { describe, expect, it } from 'vitest';
import { echoGeometry } from './echo';

const base = { severity: 2 as const, scoreMax: 0.5, confidence: 0, type: 'unknown' as const };

describe('échos du radar', () => {
  it('place l’écho selon l’heure et le score, et le fait pâlir avec l’âge', () => {
    const t = 60_000 * 1000; // multiple d'une minute : angle 0, midi
    const fresh = echoGeometry({ ...base, start: t, end: t }, t, 100, 100, 80);
    expect(fresh).not.toBeNull();
    expect(fresh?.x).toBeCloseTo(100);
    expect(fresh?.y).toBeCloseTo(60); // 0,5 × 80 au-dessus du centre
    expect(fresh?.alpha).toBeCloseTo(1);
    const old = echoGeometry({ ...base, start: t, end: t }, t + 45_000, 100, 100, 80);
    expect(old?.alpha).toBeCloseTo(0.25);
  });

  it('grossit avec la gravité et disparaît après une minute', () => {
    const t = 1_000_000;
    const minor = echoGeometry({ ...base, severity: 0, start: t, end: t }, t, 0, 0, 50);
    const major = echoGeometry({ ...base, severity: 3, start: t, end: t }, t, 0, 0, 50);
    expect(major?.r ?? 0).toBeGreaterThan(minor?.r ?? 0);
    expect(echoGeometry({ ...base, start: t, end: t }, t + 61_000, 0, 0, 50)).toBeNull();
  });
});
