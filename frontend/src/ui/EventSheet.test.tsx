import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEvent } from '../events/types';
import { fr } from '../i18n/fr';
import { EventSheet } from './EventSheet';

const event: SoundEvent = {
  id: 'e1',
  sessionId: 's',
  start: 1_000,
  end: 3_500,
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [{ index: 435, name: 'Glass', score: 0.81, family: 'glass' }],
  scoreMax: 0.66,
  confidence: 0.85,
  levelDbMax: -21,
  context: {
    families: [{ family: 'ambient', share: 0.9 }],
    meanLevelDb: -52,
    levelStdDb: 1.2,
    frames: 120,
  },
  closed: true,
  dialogStatus: 'none',
  note: '',
};

describe('EventSheet', () => {
  it('montre les détails, le contexte et indique l’absence d’extrait', () => {
    render(<EventSheet event={event} clip={null} onClose={vi.fn()} onSaveNote={vi.fn()} />);
    expect(
      screen.getByRole('heading', { name: new RegExp(fr.families.glass) }),
    ).toBeInTheDocument();
    expect(screen.getByText('2.5 s')).toBeInTheDocument();
    expect(screen.getByText(/Glass/)).toBeInTheDocument();
    expect(screen.getByText(/ambiance 90 %/)).toBeInTheDocument();
    expect(screen.getByText(fr.events.replayUnavailable)).toBeInTheDocument();
  });

  it('enregistre la note', async () => {
    const onSaveNote = vi.fn(() => Promise.resolve());
    render(
      <EventSheet
        event={event}
        clip={new Float32Array(10)}
        onClose={vi.fn()}
        onSaveNote={onSaveNote}
      />,
    );
    expect(screen.getByRole('button', { name: fr.events.replay })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(fr.events.note), { target: { value: 'le chat' } });
    fireEvent.click(screen.getByRole('button', { name: fr.events.saveNote }));
    expect(onSaveNote).toHaveBeenCalledWith('e1', 'le chat');
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(fr.events.saved);
    });
  });
});
