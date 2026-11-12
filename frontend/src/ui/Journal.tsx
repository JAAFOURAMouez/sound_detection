import { t } from '../i18n';

export function Journal() {
  return (
    <section className="sg-journal" aria-labelledby="journal-title">
      <h2 id="journal-title" className="sg-panel-title sg-label">
        {t.main.journal}
      </h2>
      <p className="sg-journal__empty">{t.main.journalEmpty}</p>
    </section>
  );
}
