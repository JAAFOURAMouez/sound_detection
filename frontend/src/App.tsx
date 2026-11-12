import { useAppStore } from './state/appStore';
import { ConsentScreen } from './ui/ConsentScreen';
import { MainScreen } from './ui/MainScreen';

export function App() {
  const status = useAppStore((s) => s.status);
  const errorKind = useAppStore((s) => s.errorKind);
  const requestCapture = useAppStore((s) => s.requestCapture);
  const pause = useAppStore((s) => s.pause);
  const resume = useAppStore((s) => s.resume);
  const stop = useAppStore((s) => s.stop);

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
    <MainScreen
      status={status}
      level={null}
      spectrogram={null}
      onPause={() => void pause()}
      onResume={() => void resume()}
      onStop={() => void stop()}
    />
  );
}
