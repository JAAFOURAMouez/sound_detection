import type { ReactNode } from 'react';
import type { SoundEvent } from '../events/types';
import type { AppStatus } from '../state/appStore';
import { Journal } from './Journal';
import { Radar } from './Radar';
import { StatusBar } from './StatusBar';
import { initialDialog } from '../assistant/machine';
import { TransmissionLine } from './TransmissionLine';

const IDLE_TRANSMISSION = {
  dialog: initialDialog,
  backend: 'unknown' as const,
  voice: true,
  dictation: { available: false, active: false },
  onSubmit: () => undefined,
  onDictate: () => undefined,
  onVoice: () => undefined,
};

interface MainScreenProps {
  status: AppStatus;
  demo: boolean;
  model: ReactNode;
  level: ReactNode;
  spectrogram: ReactNode;
  live: ReactNode;
  anomaly?: ReactNode;
  controls?: ReactNode;
  calibration?: number | null;
  transmission?: ReactNode;
  demoPicker: ReactNode;
  events?: readonly SoundEvent[];
  onSelectEvent?: (id: string) => void;
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
  anomaly = null,
  controls = null,
  calibration = null,
  transmission = null,
  demoPicker,
  events = [],
  onSelectEvent = () => undefined,
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
        controls={controls}
        level={level}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
      />
      <main className="sg-main__body">
        <Radar
          sweeping={status === 'monitoring' || status === 'calibrating'}
          calibration={calibration}
          events={events}
          onSelect={onSelectEvent}
        />
        <div className="sg-side">
          {demoPicker}
          {anomaly}
          {live}
          <Journal events={events} onSelect={onSelectEvent} />
        </div>
      </main>
      <div className="sg-main__spectrogram">{spectrogram}</div>
      {transmission ?? <TransmissionLine {...IDLE_TRANSMISSION} />}
    </div>
  );
}
