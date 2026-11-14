import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEvent } from '../events/types';
import { fr } from '../i18n/fr';
import { Journal } from './Journal';

const ev = (id: string, start: number, over: Partial<SoundEvent> = {}): SoundEvent => ({
  id,
  sessionId: 's',
  start,
  end: start,
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [],
  scoreMax: 0.4,
  confidence: 0.91,
  levelDbMax: null,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: true,
  dialogStatus: 'none',
  note: '',
  ...over,
});

describe('Journal', () => {
  it('liste les événements du plus récent au plus ancien, lisibles comme un relevé', () => {
    render(
      <Journal
        events={[
          ev('a', 1_000),
          ev('b', 2_000, { type: 'unknown', family: null, scoreMax: 0.74, severity: 1 }),
        ]}
        onSelect={vi.fn()}
      />,
    );
    const rows = screen.getAllByRole('button');
    expect(rows[0]).toHaveTextContent(fr.events.unknown);
    expect(rows[0]).toHaveTextContent('0.74');
    expect(rows[1]).toHaveTextContent(fr.families.glass);
    expect(rows[1]).toHaveTextContent('0.91');
    expect(rows[1]).toHaveTextContent(`${fr.live.severity} 2`);
  });

  it('ouvre la fiche au clic (et donc au clavier)', () => {
    const onSelect = vi.fn();
    render(<Journal events={[ev('a', 1_000)]} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('affiche la note de l’événement', () => {
    render(<Journal events={[ev('a', 1_000, { note: 'le chat' })]} onSelect={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('le chat');
  });

  it('signale l’absence d’événement', () => {
    render(<Journal events={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(fr.main.journalEmpty)).toBeInTheDocument();
  });
});
