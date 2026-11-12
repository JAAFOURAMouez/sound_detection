import { t } from '../i18n';

/** Indicateur toujours visible tant que le micro est ouvert (ou rappel du mode démo). */
export function MicIndicator({ paused, demo = false }: { paused: boolean; demo?: boolean }) {
  if (demo) {
    return (
      <p className="sg-mic sg-mic--demo" role="status">
        <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
          <path d="M2 1.5v11l9-5.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span>{t.main.demoMode}</span>
      </p>
    );
  }
  return (
    <p className={`sg-mic ${paused ? 'sg-mic--paused' : 'sg-mic--live'}`} role="status">
      <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true">
        <rect
          x="3.5"
          y="0.75"
          width="5"
          height="8"
          rx="2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path
          d="M1 6.5a5 5 0 0 0 10 0M6 11.5V13.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {paused && <path d="M0.5 13.5 11.5 0.5" stroke="currentColor" strokeWidth="1.5" />}
      </svg>
      <span>{paused ? t.main.micPaused : t.main.micActive}</span>
    </p>
  );
}
