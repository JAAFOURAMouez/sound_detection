import type { ReactNode } from 'react';
import type { AppStatus } from '../state/appStore';
import { Journal } from './Journal';
import { Radar } from './Radar';
import { StatusBar } from './StatusBar';
import { TransmissionLine } from './TransmissionLine';

interface MainScreenProps {
  status: AppStatus;
  demo: boolean;
  model: ReactNode;
  level: ReactNode;
  spectrogram: ReactNode;
  live: ReactNode;
  demoPicker: ReactNode;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function MainScreen({
  status,
  demo,
  model,
  level,
  spectrogram,
  live,
  demoPicker,
  onPause,
  onResume,
  onStop,
}: MainScreenProps) {
  return (
    <div className="sg-main" data-status={status}>
      <StatusBar
        status={status}
        demo={demo}
        model={model}
        level={level}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
      />
      <main className="sg-main__body">
        <Radar sweeping={status === 'monitoring'} />
        <div className="sg-side">
          {demoPicker}
          {live}
          <Journal />
        </div>
      </main>
      <div className="sg-main__spectrogram">{spectrogram}</div>
      <TransmissionLine />
    </div>
  );
}
