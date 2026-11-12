import { useMemo, useRef } from 'react';
import { computeRms, LevelSmoother, toDbfs } from '../audio/level';
import { t } from '../i18n';
import { type CanvasFrame, useCanvasLoop } from './useCanvasLoop';

const MIN_DB = -60;
const SEGMENTS = 24;
/** Mise à jour du texte et de l'ARIA : 4 fois par seconde suffit. */
const TEXT_INTERVAL_MS = 250;

interface LevelMeterProps {
  analyser: AnalyserNode | null;
  running: boolean;
}

export function LevelMeter({ analyser, running }: LevelMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const lastText = useRef(0);
  const peak = useRef({ value: MIN_DB, age: 0 });
  const colors = useRef<{ phosphor: string; grid: string; text: string } | null>(null);

  const state = useMemo(
    () => ({
      samples: new Float32Array(analyser?.fftSize ?? 2_048),
      smoother: new LevelSmoother({ attack: 0.02, release: 0.3, floor: MIN_DB }),
    }),
    [analyser],
  );

  const draw = ({ ctx, width, height, time, dt }: CanvasFrame) => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(state.samples);
    const db = state.smoother.step(toDbfs(computeRms(state.samples), MIN_DB), dt);

    peak.current.age += dt;
    if (db >= peak.current.value || peak.current.age > 1.5) peak.current = { value: db, age: 0 };

    if (!colors.current) {
      // Lu une seule fois : getComputedStyle à chaque image forcerait un recalcul de style.
      const styles = getComputedStyle(document.documentElement);
      colors.current = {
        phosphor: styles.getPropertyValue('--sg-phosphor').trim() || '#4ff0a8',
        grid: styles.getPropertyValue('--sg-grid-strong').trim() || '#23364a',
        text: styles.getPropertyValue('--sg-text').trim() || '#d6e0e8',
      };
    }
    const { phosphor, grid, text } = colors.current;

    ctx.clearRect(0, 0, width, height);
    const gap = 2;
    const segW = (width - gap * (SEGMENTS - 1)) / SEGMENTS;
    const lit = Math.round(((db - MIN_DB) / -MIN_DB) * SEGMENTS);
    const peakSeg = Math.round(((peak.current.value - MIN_DB) / -MIN_DB) * SEGMENTS) - 1;
    for (let i = 0; i < SEGMENTS; i++) {
      // Hauteur croissante : le niveau se lit aussi à la forme, pas seulement à la couleur.
      const segH = height * (0.35 + (0.65 * (i + 1)) / SEGMENTS);
      ctx.fillStyle = i < lit ? phosphor : i === peakSeg ? text : grid;
      ctx.fillRect(i * (segW + gap), height - segH, segW, segH);
    }

    if (time - lastText.current > TEXT_INTERVAL_MS) {
      lastText.current = time;
      const rounded = String(Math.round(db));
      if (readoutRef.current) readoutRef.current.textContent = `${rounded} dB`;
      meterRef.current?.setAttribute('aria-valuenow', rounded);
    }
  };

  useCanvasLoop(canvasRef, draw, running && analyser !== null);

  return (
    <div
      ref={meterRef}
      className="sg-level"
      role="meter"
      aria-label={t.main.level}
      aria-valuemin={MIN_DB}
      aria-valuemax={0}
      aria-valuenow={MIN_DB}
    >
      <span className="sg-label">{t.main.level}</span>
      <canvas ref={canvasRef} className="sg-level__canvas" aria-hidden="true" />
      <span ref={readoutRef} className="sg-level__readout">
        — dB
      </span>
    </div>
  );
}
