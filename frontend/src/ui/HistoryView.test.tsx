import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SoundEvent } from '../events/types';
import { fr } from '../i18n/fr';
import { ALL_TYPES } from '../state/historyStore';
import { HistoryView } from './HistoryView';

const ev = (id: string, family: string | null, type: SoundEvent['type'] = 'known'): SoundEvent => ({
  id,
  sessionId: 's',
  start: 1_000,
  end: 2_000,
  type,
  family,
  severity: 2,
  topK: [],
  scoreMax: 0.5,
  confidence: 0.8,
  levelDbMax: null,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: true,
  dialogStatus: 'none',
  note: '',
});

function renderView(events: SoundEvent[], overrides = {}) {
  const props = {
    loaded: true,
    error: null,
    events,
    allEvents: events,
    sessions: [
      { id: 's', startedAt: 0, endedAt: null, source: 'demo' as const, classifier: 'yamnet' },
    ],
    filters: { family: null, types: [...ALL_TYPES], minSeverity: 0 },
    onFilters: vi.fn(),
    onSelect: vi.fn(),
    onExport: vi.fn(),
    onClear: vi.fn(() => Promise.resolve()),
    loadScores: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };
  render(<HistoryView {...props} />);
  return props;
}

describe('HistoryView', () => {
  it('résume la répartition par famille', () => {
    renderView([ev('a', 'glass'), ev('b', 'glass'), ev('c', null, 'unknown')]);
    expect(screen.getByRole('status')).toHaveTextContent(`3 ${fr.history.count}`);
    expect(screen.getAllByText(fr.families.glass).length).toBeGreaterThan(0);
    expect(screen.getAllByText(fr.events.unknown).length).toBeGreaterThan(0);
  });

  it('transmet les filtres', () => {
    const props = renderView([ev('a', 'glass')]);
    fireEvent.click(screen.getByLabelText(fr.events.types.drift));
    expect(props.onFilters).toHaveBeenCalledWith({ types: ['known', 'unknown'] });
  });

  it('exporte et demande confirmation avant de tout supprimer', async () => {
    const props = renderView([ev('a', 'glass')]);
    fireEvent.click(screen.getByRole('button', { name: fr.history.exportCsv }));
    expect(props.onExport).toHaveBeenCalledWith('csv');
    fireEvent.click(screen.getByRole('button', { name: fr.history.delete }));
    expect(props.onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: fr.history.confirmDelete }));
    await waitFor(() => {
      expect(props.onClear).toHaveBeenCalled();
    });
  });

  it('indique un historique vide', () => {
    renderView([]);
    expect(screen.getByText(fr.history.empty)).toBeInTheDocument();
  });
});
