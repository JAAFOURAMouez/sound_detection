import { t } from '../i18n';

export function TransmissionLine() {
  return (
    <section className="sg-transmission" aria-labelledby="transmission-title">
      <h2 id="transmission-title" className="sg-sr-only">
        {t.main.transmission}
      </h2>
      <span className="sg-transmission__glyph" aria-hidden="true">
        ◉
      </span>
      <p className="sg-transmission__text" aria-live="polite">
        {t.main.transmissionIdle}
      </p>
    </section>
  );
}
