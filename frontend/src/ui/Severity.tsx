import type { Severity as SeverityLevel } from '../inference/families';
import { t } from '../i18n';

/** Gravité de 0 à 3 en barres (▮), lisible sans couleur. */
export function Severity({ level }: { level: SeverityLevel }) {
  return (
    <span
      className="sg-severity"
      data-severity={level}
      title={`${t.live.severity} ${String(level)}`}
    >
      <span aria-hidden="true">{'▮'.repeat(level) || '·'}</span>
      <span className="sg-sr-only">
        {t.live.severity} {level}
      </span>
    </span>
  );
}
