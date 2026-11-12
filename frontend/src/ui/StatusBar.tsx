import type { ReactNode } from 'react';
import { t } from '../i18n';
import type { AppStatus } from '../state/appStore';
import { MicIndicator } from './MicIndicator';
import { StatusGlyph } from './StatusGlyph';

interface StatusBarProps {
  status: AppStatus;
  level: ReactNode;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function StatusBar({ status, level, onPause, onResume, onStop }: StatusBarProps) {
  const paused = status === 'paused';
  return (
    <header className="sg-statusbar">
      <p className="sg-statusbar__brand">
        <span className="sg-statusbar__name">{t.app.name}</span>
        <span className="sg-statusbar__state" data-status={status}>
          <StatusGlyph status={status} />
          <span>
            {t.status.label} : <strong>{t.status[status]}</strong>
          </span>
        </span>
      </p>
      <div className="sg-statusbar__level">{level}</div>
      <MicIndicator paused={paused} />
      <div className="sg-statusbar__actions">
        <button
          type="button"
          className="sg-icon-button"
          onClick={paused ? onResume : onPause}
          aria-label={paused ? t.main.resume : t.main.pause}
          title={paused ? t.main.resume : t.main.pause}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            {paused ? (
              <path d="M3 1.5v11l9-5.5Z" fill="currentColor" />
            ) : (
              <>
                <rect x="2.5" y="1.5" width="3" height="11" fill="currentColor" />
                <rect x="8.5" y="1.5" width="3" height="11" fill="currentColor" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          className="sg-icon-button"
          onClick={onStop}
          aria-label={t.main.stop}
          title={t.main.stop}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <rect x="2" y="2" width="10" height="10" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  );
}
