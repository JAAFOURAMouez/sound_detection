import type { ClassifierKind } from '../inference/config';
import { t } from '../i18n';
import type { AppState } from '../state/appStore';

const KINDS: ClassifierKind[] = ['yamnet', 'cnn'];

export function ClassifierSwitch({
  classifier,
  onChange,
}: {
  classifier: AppState['classifier'];
  onChange: (kind: ClassifierKind) => void;
}) {
  return (
    <fieldset className="sg-switch" disabled={classifier.switching}>
      <legend className="sg-sr-only">{t.classifier.label}</legend>
      <span className="sg-switch__label" aria-hidden="true">
        {t.classifier.label}
      </span>
      {KINDS.map((kind) => (
        <label key={kind} className="sg-switch__option">
          <input
            type="radio"
            name="classifier"
            value={kind}
            checked={classifier.kind === kind}
            onChange={() => {
              onChange(kind);
            }}
          />
          <span>{t.classifier[kind]}</span>
        </label>
      ))}
      {classifier.switching && <span className="sg-switch__note">{t.classifier.switching}</span>}
      {classifier.error && (
        <span className="sg-switch__note" role="alert">
          {t.classifier.failed}
        </span>
      )}
    </fieldset>
  );
}
