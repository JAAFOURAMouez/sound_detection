import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fr } from '../i18n/fr';
import { ConsentScreen } from './ConsentScreen';

describe('ConsentScreen', () => {
  it('explique le traitement local et demande l’accord', () => {
    const onAccept = vi.fn();
    render(<ConsentScreen pending={false} errorKind={null} onAccept={onAccept} />);
    expect(screen.getByRole('heading', { name: fr.consent.title })).toBeInTheDocument();
    expect(screen.getByText(fr.consent.points[0])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.consent.accept }));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('désactive le bouton pendant la demande', () => {
    render(<ConsentScreen pending errorKind={null} onAccept={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(fr.consent.pending);
  });

  it('affiche la marche à suivre après un refus et propose de réessayer', () => {
    render(<ConsentScreen pending={false} errorKind="denied" onAccept={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(fr.captureError.denied.title);
    expect(screen.getByRole('button', { name: fr.consent.retry })).toBeEnabled();
  });
});
