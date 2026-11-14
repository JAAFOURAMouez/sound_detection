import { memo } from 'react';
import type { SoundEvent } from '../events/types';
import { t } from '../i18n';
import { eventColorKey, eventLabel, eventValue, formatTime } from './eventFormat';
import { Severity } from './Severity';

interface JournalProps {
  events: readonly SoundEvent[];
  onSelect: (id: string) => void;
  /** Nombre maximal de lignes affichées (les plus récentes). */
  limit?: number;
}

/** Mémoïsé : ne se redessine que si la liste change (pas à chaque mesure d'anomalie). */
export const Journal = memo(function Journal({ events, onSelect, limit = 200 }: JournalProps) {
  const recent = events.slice(-limit).reverse();
  return (
    <section className="sg-journal" aria-labelledby="journal-title">
      <h2 id="journal-title" className="sg-panel-title sg-label">
        {t.main.journal}
      </h2>
      {recent.length === 0 ? (
        <p className="sg-journal__empty">{t.main.journalEmpty}</p>
      ) : (
        <ol className="sg-journal__list" aria-label={t.events.journalLabel}>
          {recent.map((e) => {
            const value = eventValue(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className="sg-journal__row"
                  data-type={e.type}
                  onClick={() => {
                    onSelect(e.id);
                  }}
                >
                  <time dateTime={new Date(e.start).toISOString()}>{formatTime(e.start)}</time>
                  <span
                    className="sg-journal__label"
                    style={{ color: `var(--sg-family-${eventColorKey(e)})` }}
                  >
                    {eventLabel(e)}
                    {!e.closed && <span className="sg-journal__open"> · {t.events.open}</span>}
                    {e.note && <span className="sg-journal__note"> · {e.note}</span>}
                  </span>
                  <span className="sg-journal__value">
                    {value === null ? '—' : value.toFixed(2)}
                  </span>
                  <Severity level={e.severity} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
});
