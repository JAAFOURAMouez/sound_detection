import { useMemo, useRef } from 'react';
import { VIZ_MAX_DB, VIZ_MAX_FREQUENCY, VIZ_MEL_BANDS, VIZ_MIN_DB } from '../audio/config';
import { t } from '../i18n';
import { buildColormap, normalizeDb } from './viz/colormap';
import { applyFilterbank, buildMelFilterbank, hzToMel } from './viz/melScale';
import { type CanvasFrame, useCanvasLoop } from './useCanvasLoop';

/** Vitesse de défilement, en pixels CSS par seconde. */
const SCROLL_SPEED = 48;
const AXIS_TICKS_HZ = [500, 1_000, 2_000, 4_000, 8_000];

interface SpectrogramProps {
  analyser: AnalyserNode | null;
  running: boolean;
}

export function Spectrogram({ analyser, running }: SpectrogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRemainder = useRef(0);

  const resources = useMemo(() => {
    if (!analyser) return null;
    const binCount = analyser.frequencyBinCount;
    return {
      spectrum: new Float32Array(binCount),
      bands: new Float32Array(VIZ_MEL_BANDS),
      bank: buildMelFilterbank(
        binCount,
        analyser.context.sampleRate,
        VIZ_MEL_BANDS,
        0,
        VIZ_MAX_FREQUENCY,
      ),
      lut: buildColormap(256),
    };
  }, [analyser]);

  const clear = ({ ctx }: Pick<CanvasFrame, 'ctx'>) => {
    const canvas = ctx.canvas;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgb(0 0 4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const draw = ({ ctx, dt }: CanvasFrame) => {
    if (!analyser || !resources) return;
    const canvas = ctx.canvas;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dpr = window.devicePixelRatio || 1;
    scrollRemainder.current += SCROLL_SPEED * dpr * dt;
    const shift = Math.floor(scrollRemainder.current);
    if (shift <= 0) return;
    scrollRemainder.current -= shift;

    analyser.getFloatFrequencyData(resources.spectrum);
    applyFilterbank(resources.spectrum, resources.bank, resources.bands, VIZ_MIN_DB);

    // Décale l'image vers la gauche puis peint la colonne la plus récente à droite.
    ctx.drawImage(canvas, shift, 0, w - shift, h, 0, 0, w - shift, h);
    const column = ctx.createImageData(shift, h);
    const { lut, bands } = resources;
    for (let y = 0; y < h; y++) {
      // Basses fréquences en bas.
      const band = Math.min(bands.length - 1, Math.floor(((h - 1 - y) / h) * bands.length));
      const v = normalizeDb(bands[band] ?? VIZ_MIN_DB, VIZ_MIN_DB, VIZ_MAX_DB);
      const idx = Math.round(v * 255) * 4;
      for (let x = 0; x < shift; x++) {
        const o = (y * shift + x) * 4;
        column.data[o] = lut[idx] ?? 0;
        column.data[o + 1] = lut[idx + 1] ?? 0;
        column.data[o + 2] = lut[idx + 2] ?? 0;
        column.data[o + 3] = 255;
      }
    }
    ctx.putImageData(column, w - shift, 0);
  };

  useCanvasLoop(canvasRef, draw, running && analyser !== null, clear);

  const melTop = hzToMel(VIZ_MAX_FREQUENCY);
  return (
    <figure
      className="sg-spectrogram"
      aria-labelledby="spectro-title"
      aria-describedby="spectro-desc"
    >
      <figcaption className="sg-panel-title">
        <span id="spectro-title" className="sg-label">
          {t.main.spectrogram}
        </span>
        <span id="spectro-desc" className="sg-sr-only">
          {t.main.spectrogramDescription}
        </span>
      </figcaption>
      <div className="sg-spectrogram__frame">
        <canvas ref={canvasRef} className="sg-spectrogram__canvas" aria-hidden="true" />
        <ol className="sg-spectrogram__axis" aria-hidden="true">
          {AXIS_TICKS_HZ.map((hz) => (
            <li key={hz} style={{ bottom: `${String((hzToMel(hz) / melTop) * 100)}%` }}>
              {hz >= 1_000 ? `${String(hz / 1_000)}k` : String(hz)}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
