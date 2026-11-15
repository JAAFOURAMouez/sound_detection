import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '../events/db';
import { fr } from '../i18n/fr';
import { SessionReportPanel } from './SessionReportPanel';

const session = (id: string): SessionRecord => ({
  id,
  startedAt: 0,
  endedAt: 120_000,
  source: 'demo',
  classifier: 'yamnet',
});

describe('SessionReportPanel', () => {
  it('rédige le rapport de la session choisie et dit d’où il vient', async () => {
    const onReport = vi.fn(() =>
      Promise.resolve({ summary: 'Session calme.', highlights: ['22:04 — verre'], fallback: true }),
    );
    render(<SessionReportPanel session={session('s1')} events={[]} onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: fr.report.generate }));
    expect(await screen.findByText('Session calme.')).toBeInTheDocument();
    expect(screen.getByText('22:04 — verre')).toBeInTheDocument();
    expect(screen.getByText(fr.report.local)).toBeInTheDocument();
    expect(onReport).toHaveBeenCalledWith({ events: [], session_minutes: 2 });
  });

  it('efface le rapport quand on change de session', async () => {
    const onReport = vi.fn(() =>
      Promise.resolve({ summary: 'Rapport A.', highlights: [], fallback: false }),
    );
    const { rerender } = render(
      <SessionReportPanel session={session('a')} events={[]} onReport={onReport} />,
    );
    fireEvent.click(screen.getByRole('button', { name: fr.report.generate }));
    expect(await screen.findByText(fr.report.remote)).toBeInTheDocument();
    rerender(<SessionReportPanel session={session('b')} events={[]} onReport={onReport} />);
    expect(screen.queryByText('Rapport A.')).not.toBeInTheDocument();
  });
});
