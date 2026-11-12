import { t } from './i18n';
import { useAppStore } from './state/appStore';
import { ConsentScreen } from './ui/ConsentScreen';

export function App() {
  const status = useAppStore((s) => s.status);
  const errorKind = useAppStore((s) => s.errorKind);
  const requestCapture = useAppStore((s) => s.requestCapture);

  if (status === 'idle' || status === 'consent' || status === 'error') {
    return (
      <ConsentScreen
        pending={status === 'consent'}
        errorKind={errorKind}
        onAccept={() => void requestCapture()}
      />
    );
  }

  return (
    <main>
      <p role="status">
        {t.status.label} : {t.status[status]}
      </p>
    </main>
  );
}
