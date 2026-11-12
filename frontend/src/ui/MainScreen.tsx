import type { ReactNode } from 'react';
import type { AppStatus } from '../state/appStore';
import { Journal } from './Journal';
import { Radar } from './Radar';
import { StatusBar } from './StatusBar';
import { TransmissionLine } from './TransmissionLine';

interface MainScreenProps {
  status: AppStatus;
  level: ReactNode;
  spectrogram: ReactNode;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function MainScreen({
  status,
  level,
  spectrogram,
  onPause,
  onResume,
  onStop,
}: MainScreenProps) {
  return (
    <div className="sg-main" data-status={status}>
      <StatusBar
        status={status}
        level={level}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
      />
      <main className="sg-main__body">
        <Radar sweeping={status === 'monitoring'} />
        <Journal />
      </main>
      <div className="sg-main__spectrogram">{spectrogram}</div>
      <TransmissionLine />
    </div>
  );
}
