import { describe, expect, it } from 'vitest';
import { EchoGuard } from './echoGuard';

describe('EchoGuard', () => {
  it('ne couvre rien tant que l’assistant n’a pas parlé', () => {
    expect(new EchoGuard(16_000, 16_000).covers(100_000)).toBe(false);
  });

  it('couvre toute fenêtre qui finit après le début de la parole, tant qu’elle dure', () => {
    const guard = new EchoGuard(16_000, 16_000);
    guard.begin(100_000);
    expect(guard.covers(100_000)).toBe(false); // entièrement avant la parole
    expect(guard.covers(100_001)).toBe(true);
    expect(guard.covers(1_000_000)).toBe(true);
  });

  it('couvre les fenêtres en retard qui contiennent la voix ou sa traîne, puis plus rien', () => {
    const guard = new EchoGuard(16_000, 16_000);
    guard.begin(100_000);
    guard.end(180_000); // 5 s de parole, traîne jusqu'à 196 000
    expect(guard.covers(150_000)).toBe(true); // analysée après la fin, mais pendant la parole
    expect(guard.covers(196_000)).toBe(true); // dans la traîne
    expect(guard.covers(211_999)).toBe(true); // déborde encore d'un échantillon
    expect(guard.covers(212_000)).toBe(false); // commence à la fin de la traîne
  });

  it('garde plusieurs prises de parole et ignore un second début', () => {
    const guard = new EchoGuard(0, 1_000);
    guard.begin(10_000);
    guard.begin(12_000);
    guard.end(20_000);
    guard.begin(50_000);
    guard.end(60_000);
    expect(guard.covers(10_500)).toBe(true);
    expect(guard.covers(30_000)).toBe(false);
    expect(guard.covers(55_000)).toBe(true);
  });
});
