import { useState } from 'react';
import type { SessionRecord } from '../events/db';
import { type ReportPayload, type SessionReport, toReportPayload } from '../events/report';
import type { SoundEvent } from '../events/types';
import { t } from '../i18n';

interface SessionReportPanelProps {
  session: SessionRecord | null;
  /** Événements de cette session (sans les filtres d'affichage). */
  events: SoundEvent[];
  onReport: (payload: ReportPayload) => Promise<SessionReport>;
  now?: () => number;
}

type ReportState =
  | { phase: 'idle' }
  | { phase: 'loading'; sessionId: string }
  | { phase: 'done'; sessionId: string; report: SessionReport };

/** Synthèse écrite d'une session : seules les métadonnées des événements partent au backend. */
export function SessionReportPanel({
  session,
  events,
  onReport,
  now = () => Date.now(),
}: SessionReportPanelProps) {
  const [stored, setStored] = useState<ReportState>({ phase: 'idle' });
  // Un rapport décrit une session précise : choisir une autre session l'efface.
  const state: ReportState =
    stored.phase !== 'idle' && stored.sessionId === session?.id ? stored : { phase: 'idle' };

  if (!session) return null;

  const generate = () => {
    const sessionId = session.id;
    setStored({ phase: 'loading', sessionId });
    void onReport(toReportPayload(session, events, now())).then((report) => {
      setStored({ phase: 'done', sessionId, report });
    });
  };

  return (
    <section
      className="sg-report"
      aria-labelledby="report-title"
      aria-busy={state.phase === 'loading'}
    >
      <h2 id="report-title" className="sg-panel-title sg-label">
        {t.report.title}
      </h2>
      <p className="sg-history__note">{t.report.privacy}</p>
      <button
        type="button"
        className="sg-button"
        onClick={generate}
        disabled={state.phase === 'loading'}
      >
        {state.phase === 'loading'
          ? t.report.loading
          : state.phase === 'done'
            ? t.report.again
            : t.report.generate}
      </button>
      <div aria-live="polite" className="sg-report__body">
        {state.phase === 'done' && (
          <>
            <p data-testid="report-summary">{state.report.summary}</p>
            {state.report.highlights.length > 0 && (
              <ul>
                {state.report.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            )}
            <p className="sg-report__source">
              {state.report.fallback ? t.report.local : t.report.remote}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
