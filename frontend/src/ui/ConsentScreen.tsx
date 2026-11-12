import type { CaptureErrorKind } from '../audio/capture';
import { t } from '../i18n';

interface ConsentScreenProps {
  pending: boolean;
  errorKind: CaptureErrorKind | null;
  onAccept: () => void;
  onDemo: () => void;
}

export function ConsentScreen({ pending, errorKind, onAccept, onDemo }: ConsentScreenProps) {
  const error = errorKind ? t.captureError[errorKind] : null;

  return (
    <main className="sg-consent">
      <section className="sg-consent__panel" aria-labelledby="consent-title">
        <p className="sg-label">
          {t.app.name} ▪ {t.app.tagline}
        </p>
        <h1 id="consent-title" className="sg-consent__title">
          {t.consent.title}
        </h1>
        <p>{t.consent.intro}</p>
        <ol className="sg-consent__points">
          {t.consent.points.map((point, index) => (
            <li key={point}>
              <span className="sg-consent__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ol>

        {error && (
          <div className="sg-consent__error" role="alert">
            <p className="sg-consent__error-title">{error.title}</p>
            <p>{error.body}</p>
          </div>
        )}

        <button
          type="button"
          className="sg-button sg-button--primary"
          onClick={onAccept}
          disabled={pending}
          aria-describedby={pending ? 'consent-pending' : undefined}
        >
          {error ? t.consent.retry : t.consent.accept}
        </button>
        <div className="sg-consent__alt">
          <button type="button" className="sg-button" onClick={onDemo} disabled={pending}>
            {t.consent.demo}
          </button>
          <p className="sg-consent__hint">{t.consent.demoHint}</p>
        </div>
        {pending && (
          <p id="consent-pending" className="sg-label" role="status">
            {t.consent.pending}
          </p>
        )}
      </section>
    </main>
  );
}
