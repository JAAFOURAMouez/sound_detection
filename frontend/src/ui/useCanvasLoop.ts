import { type RefObject, useEffect, useRef } from 'react';

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** Taille en pixels CSS. */
  width: number;
  height: number;
  /** Horodatage de requestAnimationFrame, en millisecondes. */
  time: number;
  /** Durée depuis l'image précédente, en secondes. */
  dt: number;
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Boucle de dessin canvas hors du cycle de rendu React : redimensionnement selon
 * devicePixelRatio, puis appel de `draw` à chaque image tant que `active` est vrai.
 * `onResize` permet de réinitialiser un dessin persistant (spectrogramme).
 */
export function useCanvasLoop(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: (frame: CanvasFrame) => void,
  active: boolean,
  onResize?: (frame: Omit<CanvasFrame, 'time' | 'dt'>) => void,
  /** Change de valeur → redessin (dessins statiques dont les données évoluent). */
  redrawKey?: unknown,
): void {
  const drawRef = useRef(draw);
  const resizeRef = useRef(onResize);
  useEffect(() => {
    drawRef.current = draw;
    resizeRef.current = onResize;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resizeRef.current?.({ ctx, width, height });
      // Sans animation, on redessine quand même après un changement de taille.
      if (!active) drawRef.current({ ctx, width, height, time: performance.now(), dt: 0 });
    };
    resize();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const dt = Math.min(0.25, Math.max(0, (time - last) / 1000));
      last = time;
      drawRef.current({ ctx, width, height, time, dt });
      if (active) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [canvasRef, active, redrawKey]);
}
