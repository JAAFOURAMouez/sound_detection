import { useAppStore } from './state/appStore';
import { AnomalyGauge } from './ui/AnomalyGauge';
import { ClassifierSwitch } from './ui/ClassifierSwitch';
import { ConsentScreen } from './ui/ConsentScreen';
import { DemoPicker } from './ui/DemoPicker';
import { LevelMeter } from './ui/LevelMeter';
import { LiveLabels } from './ui/LiveLabels';
import { MainScreen } from './ui/MainScreen';
import { ModelStatus } from './ui/ModelStatus';
import { Spectrogram } from './ui/Spectrogram';

export function App() {
  const status = useAppStore((s) => s.status);
  const source = useAppStore((s) => s.source);
  const errorKind = useAppStore((s) => s.errorKind);
  const model = useAppStore((s) => s.model);
  const live = useAppStore((s) => s.live);
  const lastSample = useAppStore((s) => s.lastSample);
  const analyser = useAppStore((s) => s.session?.analyser ?? null);
  const requestCapture = useAppStore((s) => s.requestCapture);
  const requestDemo = useAppStore((s) => s.requestDemo);
  const playSample = useAppStore((s) => s.playSample);
  const pause = useAppStore((s) => s.pause);
  const resume = useAppStore((s) => s.resume);
  const stop = useAppStore((s) => s.stop);
  const classifier = useAppStore((s) => s.classifier);
  const setClassifier = useAppStore((s) => s.setClassifier);
  const calibration = useAppStore((s) => s.calibration);
  const anomaly = useAppStore((s) => s.anomaly);
  const drift = useAppStore((s) => s.drift);
  const alerts = useAppStore((s) => s.alerts);
  const recalibrate = useAppStore((s) => s.recalibrate);

  if (status === 'idle' || status === 'consent' || status === 'error') {
    return (
      <ConsentScreen
        pending={status === 'consent'}
        errorKind={errorKind}
        onAccept={() => void requestCapture()}
        onDemo={() => void requestDemo()}
      />
    );
  }

  const running = status === 'monitoring' || status === 'calibrating';
  const anomalyAvailable = model.status !== 'error' && model.info?.anomaly !== false;
  const demo = source === 'demo';
  return (
    <MainScreen
      status={status}
      demo={demo}
      model={<ModelStatus model={model} />}
      level={<LevelMeter analyser={analyser} running={running} />}
      spectrogram={<Spectrogram analyser={analyser} running={running} />}
      live={<LiveLabels live={live} />}
      anomaly={
        <AnomalyGauge
          status={status}
          available={anomalyAvailable}
          calibration={calibration}
          anomaly={anomaly}
          drift={drift}
          alerts={alerts}
          onRecalibrate={recalibrate}
        />
      }
      controls={
        <ClassifierSwitch classifier={classifier} onChange={(kind) => void setClassifier(kind)} />
      }
      calibration={status === 'calibrating' ? calibration.progress : null}
      demoPicker={
        demo ? (
          <DemoPicker
            current={lastSample?.id ?? null}
            disabled={!running}
            onPlay={(id) => void playSample(id)}
          />
        ) : null
      }
      onPause={() => void pause()}
      onResume={() => void resume()}
      onStop={() => void stop()}
    />
  );
}
