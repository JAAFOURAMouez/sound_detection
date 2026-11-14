import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { initialDialog } from '../assistant/machine';
import { fr } from '../i18n/fr';
import { TransmissionLine } from './TransmissionLine';

const base = {
  backend: 'online' as const,
  voice: true,
  dictation: { available: false, active: false },
  onSubmit: vi.fn(),
  onDictate: vi.fn(),
  onVoice: vi.fn(),
};

describe('TransmissionLine', () => {
  it('reste discrète en veille', () => {
    render(<TransmissionLine {...base} dialog={initialDialog} />);
    expect(screen.getByText(fr.assistant.idle, { selector: '[aria-live]' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: fr.assistant.yes })).not.toBeInTheDocument();
    expect(screen.getByText(fr.assistant.backend.online)).toBeInTheDocument();
  });

  it('propose réponses rapides et saisie quand elle écoute', () => {
    const onSubmit = vi.fn();
    render(
      <TransmissionLine
        {...base}
        onSubmit={onSubmit}
        dialog={{ ...initialDialog, phase: 'listening', line: 'J’ai détecté un bruit inhabituel.' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: fr.assistant.ignore }));
    expect(onSubmit).toHaveBeenCalledWith('ignore ce type de bruit');
    fireEvent.change(screen.getByLabelText(fr.assistant.inputLabel), {
      target: { value: 'c’est grave ?' },
    });
    fireEvent.click(screen.getByRole('button', { name: fr.assistant.send }));
    expect(onSubmit).toHaveBeenLastCalledWith('c’est grave ?');
  });

  it('affiche la recommandation, sa gravité en texte et l’origine locale', () => {
    render(
      <TransmissionLine
        {...base}
        backend="offline"
        dialog={{
          ...initialDialog,
          phase: 'listening',
          line: 'On dirait du verre.',
          answer: {
            reply: 'On dirait du verre.',
            recommendation: 'Va voir.',
            severity: 'verification',
            fallback: true,
          },
        }}
      />,
    );
    const rec = screen.getByTestId('assistant-recommendation');
    expect(rec).toHaveTextContent('Va voir.');
    expect(rec).toHaveTextContent(fr.assistant.severity.verification);
    expect(rec).toHaveTextContent(fr.assistant.localAnswer);
  });

  it('annonce la dictée et coupe la voix', () => {
    const onVoice = vi.fn();
    render(
      <TransmissionLine
        {...base}
        onVoice={onVoice}
        dictation={{ available: true, active: false }}
        dialog={{ ...initialDialog, phase: 'listening', line: 'x' }}
      />,
    );
    expect(screen.getByRole('button', { name: fr.assistant.dictate })).toBeInTheDocument();
    expect(screen.getByText(fr.assistant.dictationNotice)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.assistant.voiceOn }));
    expect(onVoice).toHaveBeenCalledWith(false);
  });
});
