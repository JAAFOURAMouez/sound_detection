import { useEffect, useRef } from 'react';
import type { SoundEvent } from '../events/types';
import { t } from '../i18n';
import { eventColorKey, familyColor } from './eventFormat';
import { echoGeometry, ECHO_PERIOD_MS } from './viz/echo';
import { RADAR_PERIOD_SECONDS, RADAR_RINGS, RADAR_TICKS } from './viz/config';
import { angleForTime, polarToCanvas } from './viz/radarGeometry';
import { type CanvasFrame, prefersReducedMotion, useCanvasLoop } from './useCanvasLoop';

interface RadarProps {
  /** Le balayage tourne seulement pendant l'écoute. */
  sweeping: boolean;
  /** Progression de la calibration (0 à 1), ou null hors calibration. */
  calibration?: number | null;
  /** Événements à afficher comme échos (seuls ceux de la dernière minute apparaissent). */
  events?: readonly SoundEvent[];
  onSelect?: (id: string) => void;
  /** Horloge (ms) : Date.now par défaut, injectable pour les tests. */
  now?: () => number;
}

interface Echo {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** Dessine les échos (groupés par couleur et palier d'opacité) et renvoie leurs positions. */
function drawEchoes(
  ctx: CanvasRenderingContext2D,
  events: readonly SoundEvent[],
  current: number,
  cx: number,
  cy: number,
  radius: number,
): Echo[] {
  const placed: Echo[] = [];
  // Dessin groupé : un chemin par (couleur, palier d'opacité) au lieu d'un par écho, pour
  // tenir 60 images/s avec des centaines d'échos.
  const batches = new Map<
    string,
    { color: string; alpha: number; halo: Path2D; dot: Path2D; rings: Path2D }
  >();
  for (const event of events) {
    const g = echoGeometry(event, current, cx, cy, radius);
    if (!g) continue;
    const color = familyColor(eventColorKey(event));
    const alpha = Math.ceil(g.alpha * 8) / 8;
    const key = `${color}|${String(alpha)}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { color, alpha, halo: new Path2D(), dot: new Path2D(), rings: new Path2D() };
      batches.set(key, batch);
    }
    batch.halo.moveTo(g.x + g.r * 2.2, g.y);
    batch.halo.arc(g.x, g.y, g.r * 2.2, 0, 2 * Math.PI);
    batch.dot.moveTo(g.x + g.r, g.y);
    batch.dot.arc(g.x, g.y, g.r, 0, 2 * Math.PI);
    for (let ring = 2; ring <= event.severity; ring++) {
      batch.rings.moveTo(g.x + g.r + ring * 3, g.y);
      batch.rings.arc(g.x, g.y, g.r + ring * 3, 0, 2 * Math.PI);
    }
    placed.push({ id: event.id, x: g.x, y: g.y, r: g.r + 6 });
  }
  ctx.lineWidth = 1;
  for (const b of batches.values()) {
    ctx.fillStyle = b.color;
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = b.alpha * 0.25;
    ctx.fill(b.halo);
    ctx.globalAlpha = b.alpha;
    ctx.fill(b.dot);
    ctx.stroke(b.rings);
  }
  ctx.globalAlpha = 1;
  return placed;
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function Radar({
  sweeping,
  calibration = null,
  events = [],
  onSelect,
  now = () => Date.now(),
}: RadarProps) {
  const eventsRef = useRef(events);
  const eventsVersion = useRef(0);
  const echoes = useRef<Echo[]>([]);
  const echoLayer = useRef<HTMLCanvasElement | null>(null);
  const layerDrawnAt = useRef(Number.NEGATIVE_INFINITY);
  const layerVersion = useRef(-1);
  useEffect(() => {
    // Seuls les événements récents peuvent être visibles : on évite de parcourir tout l'historique.
    const recent: SoundEvent[] = [];
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (!e) continue;
      if (now() - e.end > ECHO_PERIOD_MS) break;
      recent.push(e);
    }
    eventsRef.current = recent;
    eventsVersion.current += 1;
  }, [events, now]);
  const calibrationRef = useRef(calibration);
  useEffect(() => {
    calibrationRef.current = calibration;
  }, [calibration]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = prefersReducedMotion();
  const colors = useRef<{ grid: string; strong: string; phosphor: string; faint: string } | null>(
    null,
  );

  const draw = ({ ctx, width, height }: CanvasFrame) => {
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

    // Calibration : un anneau se remplit pour matérialiser la ligne de base en construction.
    const progress = calibrationRef.current;
    if (progress !== null) {
      const ring = radius * 0.5;
      ctx.lineWidth = 6;
      ctx.strokeStyle = c.grid;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = c.phosphor;
      ctx.beginPath();
      ctx.arc(cx, cy, ring, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * progress);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = c.phosphor;
      ctx.font = '600 14px "IBM Plex Mono", monospace';
      ctx.fillText(`${String(Math.round(progress * 100))} %`, cx, cy);
    }

    // Échos : le temps est l'angle (un tour = la dernière minute), le score la distance au
    // centre ; la couleur donne la famille, la taille et les anneaux la gravité.
    const current = now();
    // Les échos sont dessinés sur un calque mis à jour au plus deux fois par seconde (ils ne
    // bougent pas, ils pâlissent lentement) ; chaque image ne fait que le recopier.
    const dpr = ctx.getTransform().a || 1;
    let layer = echoLayer.current;
    if (!layer || layer.width !== ctx.canvas.width || layer.height !== ctx.canvas.height) {
      layer = document.createElement('canvas');
      layer.width = ctx.canvas.width;
      layer.height = ctx.canvas.height;
      echoLayer.current = layer;
      layerDrawnAt.current = Number.NEGATIVE_INFINITY;
    }
    const layerCtx = layer.getContext('2d');
    if (
      layerCtx &&
      (current - layerDrawnAt.current >= 500 || layerVersion.current !== eventsVersion.current)
    ) {
      layerDrawnAt.current = current;
      layerVersion.current = eventsVersion.current;
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layerCtx.clearRect(0, 0, width, height);
      echoes.current = drawEchoes(layerCtx, eventsRef.current, current, cx, cy, radius);
    }
    ctx.drawImage(layer, 0, 0, width, height);

    if (!sweeping) return;

    // Balayage : l'aiguille marque l'instant présent (même horloge que les échos), une traînée
    // marque les secondes passées.
    const angle = reduced ? 0 : angleForTime(current / 1000, RADAR_PERIOD_SECONDS);
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

  useCanvasLoop(canvasRef, draw, (sweeping && !reduced) || calibration !== null);

  return (
    <figure className="sg-radar" aria-labelledby="radar-title" aria-describedby="radar-desc">
      <figcaption className="sg-panel-title">
        <span id="radar-title" className="sg-label">
          {t.main.radar}
        </span>
        <span id="radar-desc" className="sg-sr-only">
          {t.main.radarDescription} {t.events.radarHint}
        </span>
      </figcaption>
      <canvas
        ref={canvasRef}
        className="sg-radar__canvas"
        aria-hidden="true"
        onClick={(e) => {
          if (!onSelect) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best: Echo | null = null;
          let bestDistance = Number.POSITIVE_INFINITY;
          for (const echo of echoes.current) {
            const d = Math.hypot(echo.x - x, echo.y - y);
            if (d <= echo.r && d < bestDistance) {
              best = echo;
              bestDistance = d;
            }
          }
          if (best) onSelect(best.id);
        }}
      />
    </figure>
  );
}
