// Contexte sonore de la dernière minute (fonctions pures).

import type { Frame, MinuteContext } from './types';

export const CONTEXT_WINDOW_MS = 60_000;

export class ContextTracker {
  private readonly frames: Frame[] = [];

  constructor(private readonly windowMs = CONTEXT_WINDOW_MS) {}

  push(frame: Frame): void {
    this.frames.push(frame);
    while (this.frames.length > 0 && (this.frames[0]?.t ?? 0) < frame.t - this.windowMs)
      this.frames.shift();
  }

  /** Résumé des trames antérieures à `before` (exclut l'événement lui-même). */
  summary(before = Number.POSITIVE_INFINITY): MinuteContext {
    return summarize(this.frames.filter((f) => f.t < before));
  }

  reset(): void {
    this.frames.length = 0;
  }
}

export function summarize(frames: readonly Frame[]): MinuteContext {
  const counts = new Map<string, number>();
  for (const f of frames) {
    const family = f.dominant?.family ?? 'none';
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  const families = [...counts.entries()]
    .map(([family, n]) => ({ family, share: n / frames.length }))
    .sort((a, b) => b.share - a.share);
  const levels = frames.map((f) => f.levelDb).filter((l): l is number => l !== null);
  const mean = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
  const std =
    mean !== null && levels.length
      ? Math.sqrt(levels.reduce((a, b) => a + (b - mean) ** 2, 0) / levels.length)
      : null;
  return { families, meanLevelDb: mean, levelStdDb: std, frames: frames.length };
}
