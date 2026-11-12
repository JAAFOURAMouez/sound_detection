import { useAppStore } from './state/appStore';
import { ConsentScreen } from './ui/ConsentScreen';
import { LevelMeter } from './ui/LevelMeter';
import { MainScreen } from './ui/MainScreen';
import { Spectrogram } from './ui/Spectrogram';

export function App() {
  const status = useAppStore((s) => s.status);
  const errorKind = useAppStore((s) => s.errorKind);
  const requestCapture = useAppStore((s) => s.requestCapture);
  const pause = useAppStore((s) => s.pause);
  const resume = useAppStore((s) => s.resume);
  const stop = useAppStore((s) => s.stop);
  const analyser = useAppStore((s) => s.session?.analyser ?? null);

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
      level={<LevelMeter analyser={analyser} running={status === 'monitoring'} />}
      spectrogram={<Spectrogram analyser={analyser} running={status === 'monitoring'} />}
      onPause={() => void pause()}
      onResume={() => void resume()}
      onStop={() => void stop()}
    />
  );
}
