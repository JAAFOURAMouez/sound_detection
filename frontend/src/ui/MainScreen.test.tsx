import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fr } from '../i18n/fr';
import { MainScreen } from './MainScreen';

function renderMain(status: 'monitoring' | 'paused') {
  const handlers = { onPause: vi.fn(), onResume: vi.fn(), onStop: vi.fn() };
  render(<MainScreen status={status} level={null} spectrogram={null} {...handlers} />);
  return handlers;
}

describe('MainScreen', () => {
  it('montre l’état et l’indicateur micro actif pendant l’écoute', () => {
    renderMain('monitoring');
    expect(screen.getByText(fr.status.monitoring)).toBeInTheDocument();
    expect(screen.getByText(fr.main.micActive)).toBeInTheDocument();
    expect(screen.getByText(fr.main.journalEmpty)).toBeInTheDocument();
  });

  it('propose la pause pendant l’écoute et la reprise en pause', () => {
    const live = renderMain('monitoring');
    fireEvent.click(screen.getByRole('button', { name: fr.main.pause }));
    expect(live.onPause).toHaveBeenCalledOnce();
  });

  it('garde l’indicateur micro visible en pause et permet de reprendre ou d’arrêter', () => {
    const paused = renderMain('paused');
    expect(screen.getByText(fr.main.micPaused)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.main.resume }));
    expect(paused.onResume).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: fr.main.stop }));
    expect(paused.onStop).toHaveBeenCalledOnce();
  });
});
