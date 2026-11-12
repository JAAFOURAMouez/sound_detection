import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fr } from '../i18n/fr';
import { AnomalyGauge } from './AnomalyGauge';

const reading = (score: number) => ({
  windowEndSample: 0,
  raw: score,
  score,
  zReconstruction: 0,
  zEmbedding: 0,
  levelDb: -40,
  above: score >= 0.5,
  alert: false,
  receivedAt: 0,
});

describe('AnomalyGauge', () => {
  it('montre la progression de la calibration', () => {
    render(
      <AnomalyGauge
        status="calibrating"
        available
        calibration={{ progress: 0.4, done: false }}
        anomaly={null}
        drift={null}
        alerts={0}
        onRecalibrate={vi.fn()}
      />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(fr.anomaly.calibratingHint)).toBeInTheDocument();
  });

  it('affiche le score, l’état au-dessus du seuil en texte, et permet de recalibrer', () => {
    const onRecalibrate = vi.fn();
    render(
      <AnomalyGauge
        status="monitoring"
        available
        calibration={{ progress: 1, done: true }}
        anomaly={reading(0.72)}
        drift={null}
        alerts={2}
        onRecalibrate={onRecalibrate}
      />,
    );
    expect(screen.getByTestId('anomaly-score')).toHaveTextContent('0.72');
    expect(screen.getByText(fr.anomaly.above, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`2 ${fr.anomaly.alerts}`)).toBeInTheDocument();
  });

  it('accorde le compteur d’alertes au singulier', () => {
    render(
      <AnomalyGauge
        status="monitoring"
        available
        calibration={{ progress: 1, done: true }}
        anomaly={reading(0.6)}
        drift={null}
        alerts={1}
        onRecalibrate={vi.fn()}
      />,
    );
    expect(screen.getByText(`1 ${fr.anomaly.alertsOne}`)).toBeInTheDocument();
  });

  it('recalibre à la demande', () => {
    const onRecalibrate = vi.fn();
    render(
      <AnomalyGauge
        status="monitoring"
        available
        calibration={{ progress: 1, done: true }}
        anomaly={reading(0.2)}
        drift={null}
        alerts={0}
        onRecalibrate={onRecalibrate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: fr.anomaly.recalibrate }));
    expect(onRecalibrate).toHaveBeenCalledOnce();
  });

  it('propose de recalibrer quand l’ambiance a dérivé', () => {
    render(
      <AnomalyGauge
        status="monitoring"
        available
        calibration={{ progress: 1, done: true }}
        anomaly={reading(0.1)}
        drift={{
          windowEndSample: 0,
          divergence: 0.4,
          levelDeltaDb: 9,
          drifting: true,
          sustained: true,
          receivedAt: 0,
        }}
        alerts={0}
        onRecalibrate={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(fr.anomaly.drift);
  });

  it('indique l’absence de détection d’anomalies', () => {
    render(
      <AnomalyGauge
        status="monitoring"
        available={false}
        calibration={{ progress: 0, done: false }}
        anomaly={null}
        drift={null}
        alerts={0}
        onRecalibrate={vi.fn()}
      />,
    );
    expect(screen.getByText(fr.anomaly.unavailable)).toBeInTheDocument();
  });
});
