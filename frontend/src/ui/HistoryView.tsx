import { useEffect, useMemo, useRef, useState } from 'react';
import type { SessionRecord } from '../events/db';
import type { EventType, SoundEvent } from '../events/types';
import { t } from '../i18n';
import { ALL_TYPES, type HistoryFilters } from '../state/historyStore';
import { eventColorKey, eventLabel, familyColor, formatDateTime, formatTime } from './eventFormat';
import { familyLabel } from './labels';
import { type CanvasFrame, useCanvasLoop } from './useCanvasLoop';

interface HistoryViewProps {
  loaded: boolean;
  error: string | null;
  events: SoundEvent[];
  allEvents: SoundEvent[];
  sessions: SessionRecord[];
  filters: HistoryFilters;
  onFilters: (filters: Partial<HistoryFilters>) => void;
  onSelect: (id: string) => void;
  onExport: (format: 'json' | 'csv') => void;
  onClear: () => Promise<void>;
  loadScores: (sessionId: string) => Promise<{ t: number; score: number }[]>;
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Frise : chaque événement est une marque dont la hauteur donne la gravité. */
function Timeline({ events, onSelect }: { events: SoundEvent[]; onSelect: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const marks = useRef<{ id: string; x: number }[]>([]);
  const range = useMemo(() => {
    if (events.length === 0) return null;
    const start = Math.min(...events.map((e) => e.start));
    const end = Math.max(...events.map((e) => e.end), start + 60_000);
    return { start, end };
  }, [events]);

  const draw = ({ ctx, width, height }: CanvasFrame) => {
    ctx.clearRect(0, 0, width, height);
    const grid = cssVar('--sg-grid', '#16222d');
    const faint = cssVar('--sg-text-faint', '#5d6f7f');
    const base = height - 18;
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, base + 0.5);
    ctx.lineTo(width, base + 0.5);
    ctx.stroke();
    if (!range) return;
    const span = range.end - range.start;
    const xOf = (ms: number) => 8 + ((ms - range.start) / span) * (width - 16);
    ctx.fillStyle = faint;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i++) {
      const ms = range.start + (span * i) / 4;
      const x = xOf(ms);
      ctx.textAlign = i === 0 ? 'left' : i === 4 ? 'right' : 'center';
      ctx.fillText(formatTime(ms), x, base + 4);
      ctx.fillRect(x, base, 1, 3);
    }
    const placed: { id: string; x: number }[] = [];
    for (const e of events) {
      const x = xOf(e.start);
      const w = Math.max(2, xOf(e.end) - x);
      const h = 10 + e.severity * ((base - 14) / 3);
      ctx.fillStyle = familyColor(eventColorKey(e));
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, base - h, w, h);
      placed.push({ id: e.id, x: x + w / 2 });
    }
    ctx.globalAlpha = 1;
    marks.current = placed;
  };

  useCanvasLoop(canvasRef, draw, false, undefined, events);

  return (
    <figure
      className="sg-history__figure"
      aria-labelledby="timeline-title"
      aria-describedby="timeline-desc"
    >
      <figcaption className="sg-panel-title">
        <span id="timeline-title" className="sg-label">
          {t.history.timeline}
        </span>
        <span id="timeline-desc" className="sg-sr-only">
          {t.history.timelineDescription}
        </span>
      </figcaption>
      <canvas
        ref={canvasRef}
        className="sg-history__timeline"
        data-testid="timeline"
        aria-hidden="true"
        onClick={(e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          let best: { id: string; x: number } | null = null;
          for (const m of marks.current) {
            if (Math.abs(m.x - x) <= 5 && (!best || Math.abs(m.x - x) < Math.abs(best.x - x)))
              best = m;
          }
          if (best) onSelect(best.id);
        }}
      />
    </figure>
  );
}

/** Courbe du score d'anomalie (1 Hz) d'une session, avec le seuil. */
function ScoreCurve({ series }: { series: { t: number; score: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = ({ ctx, width, height }: CanvasFrame) => {
    ctx.clearRect(0, 0, width, height);
    const grid = cssVar('--sg-grid-strong', '#23364a');
    const text = cssVar('--sg-text', '#d6e0e8');
    const phosphor = cssVar('--sg-phosphor', '#4ff0a8');
    const yOf = (s: number) => height - 4 - s * (height - 8);
    ctx.strokeStyle = grid;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, yOf(0.5));
    ctx.lineTo(width, yOf(0.5));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = text;
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillText('0,5', 4, yOf(0.5) - 3);
    if (series.length < 2) return;
    const t0 = series[0]?.t ?? 0;
    const t1 = series.at(-1)?.t ?? t0 + 1;
    const xOf = (ms: number) => ((ms - t0) / Math.max(1, t1 - t0)) * width;
    ctx.strokeStyle = phosphor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    series.forEach((p, i) => {
      const x = xOf(p.t);
      const y = yOf(p.score);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  useCanvasLoop(canvasRef, draw, false, undefined, series);
  return <canvas ref={canvasRef} className="sg-history__curve" aria-hidden="true" />;
}

export function HistoryView({
  loaded,
  error,
  events,
  allEvents,
  sessions,
  filters,
  onFilters,
  onSelect,
  onExport,
  onClear,
  loadScores,
}: HistoryViewProps) {
  const [confirming, setConfirming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [series, setSeries] = useState<{ t: number; score: number }[]>([]);
  const currentSession = sessionId ?? sessions.at(-1)?.id ?? null;

  useEffect(() => {
    if (!currentSession) return;
    let cancelled = false;
    void loadScores(currentSession).then((s) => {
      if (!cancelled) setSeries(s);
    });
    return () => {
      cancelled = true;
    };
  }, [currentSession, loadScores, allEvents.length]);

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of events) {
      const key = eventColorKey(e);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);
  const presentFamilies = useMemo(
    () =>
      [...new Set(allEvents.map((e) => e.family).filter((f): f is string => f !== null))].sort(),
    [allEvents],
  );
  const maxCount = Math.max(1, ...families.map(([, n]) => n));

  if (!loaded) return <p className="sg-history__note">{t.history.loading}</p>;

  return (
    <main className="sg-history" aria-labelledby="history-title">
      <h1 id="history-title" className="sg-sr-only">
        {t.history.title}
      </h1>
      {error && (
        <p className="sg-history__note" role="alert">
          {t.history.error}
        </p>
      )}
      <form
        className="sg-history__filters"
        aria-label={t.history.filters}
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label>
          <span className="sg-label">{t.events.family}</span>
          <select
            value={filters.family ?? ''}
            onChange={(e) => {
              onFilters({ family: e.target.value || null });
            }}
          >
            <option value="">{t.history.allFamilies}</option>
            {presentFamilies.map((f) => (
              <option key={f} value={f}>
                {familyLabel(f)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="sg-label">{t.events.type}</legend>
          {ALL_TYPES.map((type: EventType) => (
            <label key={type} className="sg-history__check">
              <input
                type="checkbox"
                checked={filters.types.includes(type)}
                onChange={(e) => {
                  onFilters({
                    types: e.target.checked
                      ? [...filters.types, type]
                      : filters.types.filter((x) => x !== type),
                  });
                }}
              />
              {t.events.types[type]}
            </label>
          ))}
        </fieldset>
        <label>
          <span className="sg-label">{t.history.minSeverity}</span>
          <select
            value={filters.minSeverity}
            onChange={(e) => {
              onFilters({ minSeverity: Number(e.target.value) });
            }}
          >
            {[0, 1, 2, 3].map((s) => (
              <option key={s} value={s}>
                {s === 0 ? '·' : '▮'.repeat(s)} {s}
              </option>
            ))}
          </select>
        </label>
        <p className="sg-history__count" role="status">
          {events.length} {t.history.count}
        </p>
      </form>

      {allEvents.length === 0 ? (
        <p className="sg-history__note">{t.history.empty}</p>
      ) : (
        <>
          <Timeline events={events} onSelect={onSelect} />
          <section className="sg-history__grid">
            <section aria-labelledby="dist-title">
              <h2 id="dist-title" className="sg-panel-title sg-label">
                {t.history.distribution}
              </h2>
              <ul className="sg-history__bars">
                {families.map(([key, n]) => (
                  <li key={key}>
                    <span className="sg-history__bar-label">
                      {key === 'unknown'
                        ? t.events.unknown
                        : key === 'drift'
                          ? t.events.drift
                          : familyLabel(key)}
                    </span>
                    <span className="sg-history__bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${String((n / maxCount) * 100)}%`,
                          background: `var(--sg-family-${key})`,
                        }}
                      />
                    </span>
                    <span className="sg-history__bar-value">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="curve-title">
              <h2 id="curve-title" className="sg-panel-title sg-label">
                {t.history.scoreCurve}
              </h2>
              <label className="sg-history__session">
                <span className="sg-label">{t.history.session}</span>
                <select
                  value={currentSession ?? ''}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDateTime(s.startedAt)} · {s.source}
                    </option>
                  ))}
                </select>
              </label>
              <p className="sg-sr-only">{t.history.scoreCurveDescription}</p>
              {series.length > 1 ? (
                <ScoreCurve series={series} />
              ) : (
                <p className="sg-history__note">{t.history.noScores}</p>
              )}
            </section>
          </section>
          <section aria-label={t.main.journal} className="sg-history__list">
            <ol>
              {events
                .slice(-50)
                .reverse()
                .map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="sg-journal__row"
                      onClick={() => {
                        onSelect(e.id);
                      }}
                    >
                      <time dateTime={new Date(e.start).toISOString()}>
                        {formatDateTime(e.start)}
                      </time>
                      <span style={{ color: `var(--sg-family-${eventColorKey(e)})` }}>
                        {eventLabel(e)}
                      </span>
                      <span>{e.note}</span>
                    </button>
                  </li>
                ))}
            </ol>
          </section>
        </>
      )}

      <footer className="sg-history__actions">
        <button
          type="button"
          className="sg-button"
          onClick={() => {
            onExport('json');
          }}
          disabled={allEvents.length === 0}
        >
          {t.history.exportJson}
        </button>
        <button
          type="button"
          className="sg-button"
          onClick={() => {
            onExport('csv');
          }}
          disabled={allEvents.length === 0}
        >
          {t.history.exportCsv}
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              className="sg-button sg-button--danger"
              onClick={() => {
                void onClear().then(() => {
                  setConfirming(false);
                });
              }}
            >
              {t.history.confirmDelete}
            </button>
            <button
              type="button"
              className="sg-button"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t.history.cancel}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="sg-button"
            onClick={() => {
              setConfirming(true);
            }}
            disabled={allEvents.length === 0}
          >
            {t.history.delete}
          </button>
        )}
        <p className="sg-history__note">{t.history.privacy}</p>
      </footer>
    </main>
  );
}
