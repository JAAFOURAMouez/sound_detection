import { t } from '../i18n';
import type { AppState } from '../state/appStore';

export function ModelStatus({ model }: { model: AppState['model'] }) {
  return (
    <span
      className="sg-model"
      data-model={model.status}
      role="status"
      title={model.error ?? undefined}
    >
      <span>{t.model.label} :</span>
      <strong>
        {t.model[model.status]}
        {model.status === 'ready' && model.info?.fromCache ? ` · ${t.model.cached}` : ''}
      </strong>
    </span>
  );
}
