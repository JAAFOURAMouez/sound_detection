import { describe, expect, it } from 'vitest';
import { angleForTime, polarToCanvas } from './radarGeometry';

describe('radarGeometry', () => {
  it('fait un tour par période', () => {
    expect(angleForTime(0, 60)).toBe(0);
    expect(angleForTime(15, 60)).toBeCloseTo(Math.PI / 2);
    expect(angleForTime(75, 60)).toBeCloseTo(Math.PI / 2);
    expect(angleForTime(-15, 60)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('place 0 rad à midi et tourne dans le sens horaire', () => {
    const top = polarToCanvas(100, 100, 50, 0);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const right = polarToCanvas(100, 100, 50, Math.PI / 2);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
  });
});
