import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fr } from '../i18n/fr';
import { ConsentScreen } from './ConsentScreen';

describe('ConsentScreen', () => {
  it('explique le traitement local et demande l’accord', () => {
    const onAccept = vi.fn();
    render(<ConsentScreen pending={false} errorKind={null} onAccept={onAccept} onDemo={vi.fn()} />);
    expect(screen.getByRole('heading', { name: fr.consent.title })).toBeInTheDocument();
    expect(screen.getByText(fr.consent.points[0])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.consent.accept }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('propose un mode démonstration sans micro', () => {
    const onDemo = vi.fn();
    render(<ConsentScreen pending={false} errorKind={null} onAccept={vi.fn()} onDemo={onDemo} />);
    fireEvent.click(screen.getByRole('button', { name: fr.consent.demo }));
    expect(onDemo).toHaveBeenCalledOnce();
  });

  it('désactive les boutons pendant la demande', () => {
    render(<ConsentScreen pending errorKind={null} onAccept={vi.fn()} onDemo={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(fr.consent.pending);
  });

  it('affiche la marche à suivre après un refus et propose de réessayer', () => {
    render(
      <ConsentScreen pending={false} errorKind="denied" onAccept={vi.fn()} onDemo={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(fr.captureError.denied.title);
    expect(screen.getByRole('button', { name: fr.consent.retry })).toBeEnabled();
  });
});
