import { useRef } from 'react';
import { t } from '../i18n';
import { RADAR_PERIOD_SECONDS, RADAR_RINGS, RADAR_TICKS } from './viz/config';
import { angleForTime, polarToCanvas } from './viz/radarGeometry';
import { type CanvasFrame, prefersReducedMotion, useCanvasLoop } from './useCanvasLoop';

interface RadarProps {
  /** Le balayage tourne seulement pendant l'écoute. */
  sweeping: boolean;
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function Radar({ sweeping }: RadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = prefersReducedMotion();
  const colors = useRef<{ grid: string; strong: string; phosphor: string; faint: string } | null>(
    null,
  );

  const draw = ({ ctx, width, height, time }: CanvasFrame) => {
    colors.current ??= {
      grid: cssVar('--sg-grid', '#16222d'),
      strong: cssVar('--sg-grid-strong', '#23364a'),
      phosphor: cssVar('--sg-phosphor', '#4ff0a8'),
      faint: cssVar('--sg-text-faint', '#5d6f7f'),
    };
    const c = colors.current;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(10, Math.min(width, height) / 2 - 18);

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;

    // Anneaux de graduation (distance = score d'anomalie, de 0 au centre à 1 au bord).
    for (let i = 1; i <= RADAR_RINGS; i++) {
      ctx.strokeStyle = i === RADAR_RINGS ? c.strong : c.grid;
      ctx.beginPath();
      ctx.arc(cx, cy, (radius * i) / RADAR_RINGS, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Graduations angulaires (une toutes les 5 s) et repères en secondes.
    ctx.fillStyle = c.faint;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < RADAR_TICKS; i++) {
      const angle = (i / RADAR_TICKS) * 2 * Math.PI;
      const inner = polarToCanvas(cx, cy, radius - (i % 3 === 0 ? 10 : 5), angle);
      const outer = polarToCanvas(cx, cy, radius, angle);
      ctx.strokeStyle = c.strong;
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y);
      ctx.lineTo(outer.x, outer.y);
      ctx.stroke();
      if (i % 3 === 0) {
        const label = polarToCanvas(cx, cy, radius + 10, angle);
        ctx.fillText(String((i / RADAR_TICKS) * RADAR_PERIOD_SECONDS), label.x, label.y);
      }
    }

    // Axes en croix
    ctx.strokeStyle = c.grid;
    ctx.beginPath();
    ctx.moveTo(cx - radius, cy);
    ctx.lineTo(cx + radius, cy);
    ctx.moveTo(cx, cy - radius);
    ctx.lineTo(cx, cy + radius);
    ctx.stroke();

    if (!sweeping) return;

    // Balayage : l'aiguille donne l'instant présent, une traînée marque les secondes passées.
    const angle = reduced ? 0 : angleForTime(time / 1000, RADAR_PERIOD_SECONDS);
    const trail = reduced ? 0 : Math.PI / 6;
    const steps = 24;
    for (let s = 0; s < steps && trail > 0; s++) {
      const a0 = angle - (trail * (s + 1)) / steps;
      const a1 = angle - (trail * s) / steps;
      ctx.globalAlpha = 0.22 * (1 - s / steps);
      ctx.fillStyle = c.phosphor;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const tip = polarToCanvas(cx, cy, radius, angle);
    ctx.strokeStyle = c.phosphor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  };

  useCanvasLoop(canvasRef, draw, sweeping && !reduced);

  return (
    <figure className="sg-radar" aria-labelledby="radar-title" aria-describedby="radar-desc">
      <figcaption className="sg-panel-title">
        <span id="radar-title" className="sg-label">
          {t.main.radar}
        </span>
        <span id="radar-desc" className="sg-sr-only">
          {t.main.radarDescription}
        </span>
      </figcaption>
      <canvas ref={canvasRef} className="sg-radar__canvas" aria-hidden="true" />
    </figure>
  );
}
