import { t } from '../i18n';
import type { AnomalyReading, AppState, DriftReading } from '../state/appStore';

interface AnomalyGaugeProps {
  status: AppState['status'];
  available: boolean;
  calibration: AppState['calibration'];
  anomaly: AnomalyReading | null;
  drift: DriftReading | null;
  alerts: number;
  onRecalibrate: () => void;
}

const pct = (x: number) => `${String(Math.round(x * 100))}%`;

export function AnomalyGauge({
  status,
  available,
  calibration,
  anomaly,
  drift,
  alerts,
  onRecalibrate,
}: AnomalyGaugeProps) {
  const calibrating = status === 'calibrating' || (status === 'paused' && !calibration.done);
  const score = anomaly?.score ?? 0;
  const above = anomaly?.above ?? false;

  return (
    <section className="sg-anomaly" aria-labelledby="anomaly-title" data-above={above}>
      <h2 id="anomaly-title" className="sg-panel-title sg-label">
        {t.anomaly.title}
      </h2>
      {!available ? (
        <p className="sg-anomaly__note">{t.anomaly.unavailable}</p>
      ) : calibrating ? (
        <div className="sg-anomaly__body">
          <p className="sg-anomaly__row">
            <span className="sg-label">{t.anomaly.calibrating}</span>
            <span className="sg-anomaly__value">{pct(calibration.progress)}</span>
          </p>
          <div
            className="sg-anomaly__track"
            role="progressbar"
            aria-label={t.anomaly.calibrating}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(calibration.progress * 100)}
          >
            <span className="sg-anomaly__fill" style={{ width: pct(calibration.progress) }} />
          </div>
          <p className="sg-anomaly__note">{t.anomaly.calibratingHint}</p>
        </div>
      ) : (
        <div className="sg-anomaly__body">
          <p className="sg-anomaly__row">
            <span className="sg-anomaly__state">
              <span aria-hidden="true">{above ? '▲' : '○'}</span>{' '}
              {above ? t.anomaly.above : t.anomaly.calm}
            </span>
            <span className="sg-anomaly__value" data-testid="anomaly-score">
              {score.toFixed(2)}
            </span>
          </p>
          <div
            className="sg-anomaly__track"
            role="meter"
            aria-label={t.anomaly.title}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={Number(score.toFixed(2))}
          >
            <span className="sg-anomaly__fill" style={{ width: pct(score) }} />
            <span className="sg-anomaly__threshold" title={`${t.anomaly.threshold} 0,5`} />
          </div>
          <p className="sg-anomaly__row sg-anomaly__meta">
            <span>
              {alerts} {t.anomaly.alerts}
            </span>
            <button type="button" className="sg-button sg-button--small" onClick={onRecalibrate}>
              {t.anomaly.recalibrate}
            </button>
          </p>
          {drift?.sustained && (
            <p className="sg-anomaly__drift" role="status">
              <span aria-hidden="true">≈</span> {t.anomaly.drift}{' '}
              <span className="sg-anomaly__detail">
                ({t.anomaly.driftDetail} {drift.divergence.toFixed(2)}, {t.anomaly.level}{' '}
                {drift.levelDeltaDb >= 0 ? '+' : ''}
                {drift.levelDeltaDb.toFixed(0)} dB)
              </span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
