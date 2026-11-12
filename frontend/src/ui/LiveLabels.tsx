import { t } from '../i18n';
import type { LiveResult } from '../state/appStore';
import { familyLabel } from './labels';
import { Severity } from './Severity';

export function LiveLabels({ live }: { live: LiveResult | null }) {
  return (
    <section className="sg-live" aria-labelledby="live-title">
      <h2 id="live-title" className="sg-panel-title sg-label">
        {t.live.title}
      </h2>
      {live === null ? (
        <p className="sg-live__waiting">{t.live.waiting}</p>
      ) : (
        <>
          <ol className="sg-live__list">
            {live.top.map((c) => (
              <li key={c.index} className="sg-live__row">
                <span className="sg-live__name">
                  {c.name}
                  <span className="sg-live__family">{familyLabel(c.family)}</span>
                </span>
                <span className="sg-live__score">{c.score.toFixed(2)}</span>
                <span className="sg-live__bar" aria-hidden="true">
                  <span style={{ width: `${String(Math.round(c.score * 100))}%` }} />
                </span>
              </li>
            ))}
          </ol>
          <p
            className="sg-live__dominant"
            data-testid="dominant-family"
            data-family={live.dominant?.family ?? ''}
          >
            <span className="sg-label">{t.live.dominant}</span>
            {live.dominant ? (
              <>
                <strong>{familyLabel(live.dominant.family)}</strong>
                <span>{live.dominant.score.toFixed(2)}</span>
                <Severity level={live.dominant.severity} />
              </>
            ) : (
              <span>{t.live.none}</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
