import { describe, expect, it, vi } from 'vitest';
import type { EventChange } from '../events/engine';
import type { SoundEvent } from '../events/types';
import { createHistoryStore, filterEvents } from './historyStore';

const ev = (id: string, start: number, over: Partial<SoundEvent> = {}): SoundEvent => ({
  id,
  sessionId: 's',
  start,
  end: start + 1_000,
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [],
  scoreMax: 0.7,
  confidence: 0.8,
  levelDbMax: -20,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: true,
  dialogStatus: 'none',
  note: '',
  ...over,
});

function setup(stored: SoundEvent[] = []) {
  let listener: ((c: EventChange[]) => void) | null = null;
  const store = {
    listEvents: vi.fn(() => Promise.resolve(stored)),
    listSessions: vi.fn(() => Promise.resolve([])),
    updateNote: vi.fn(() => Promise.resolve()),
    updateDialogStatus: vi.fn(() => Promise.resolve()),
    clearAll: vi.fn(() => Promise.resolve()),
    purgeOlderThan: vi.fn(() => Promise.resolve(0)),
  };
  const recorder = {
    subscribe: (l: (c: EventChange[]) => void) => {
      listener = l;
      return () => undefined;
    },
    flush: () => Promise.resolve(),
    clips: new Map<string, Float32Array>(),
  };
  const history = createHistoryStore({ store, recorder, now: () => 0 });
  return { history, store, recorder, emit: (c: EventChange[]) => listener?.(c) };
}

describe('historyStore', () => {
  it('charge l’historique après purge et garde les événements arrivés entre-temps', async () => {
    const { history, store, emit } = setup([ev('a', 1), ev('b', 3)]);
    emit([{ kind: 'opened', event: ev('live', 2) }]);
    await history.getState().load();
    expect(store.purgeOlderThan).toHaveBeenCalled();
    expect(history.getState().events.map((e) => e.id)).toEqual(['a', 'live', 'b']);
  });

  it('applique les changements en direct (ouverture puis mise à jour)', () => {
    const { history, emit } = setup();
    emit([{ kind: 'opened', event: ev('x', 1, { closed: false }) }]);
    emit([{ kind: 'closed', event: ev('x', 1, { closed: true, scoreMax: 0.9 }) }]);
    expect(history.getState().events).toHaveLength(1);
    expect(history.getState().events[0]).toMatchObject({ closed: true, scoreMax: 0.9 });
  });

  it('filtre par famille, type et gravité', () => {
    const events = [
      ev('a', 1),
      ev('b', 2, { type: 'unknown', family: null, severity: 1 }),
      ev('c', 3, { type: 'drift', severity: 0, family: null }),
    ];
    expect(
      filterEvents(events, {
        family: null,
        types: ['known', 'unknown', 'drift'],
        minSeverity: 1,
      }).map((e) => e.id),
    ).toEqual(['a', 'b']);
    expect(
      filterEvents(events, { family: 'glass', types: ['known'], minSeverity: 0 }).map((e) => e.id),
    ).toEqual(['a']);
  });

  it('enregistre une note et supprime tout, extraits audio compris', async () => {
    const { history, store, recorder } = setup([ev('a', 1)]);
    await history.getState().load();
    await history.getState().updateNote('a', 'test');
    expect(history.getState().events[0]?.note).toBe('test');
    expect(store.updateNote).toHaveBeenCalledWith('a', 'test');
    recorder.clips.set('a', new Float32Array(3));
    await history.getState().clearAll();
    expect(history.getState().events).toEqual([]);
    expect(recorder.clips.size).toBe(0);
  });

  it('exporte en JSON et en CSV', async () => {
    const { history } = setup([ev('a', 1)]);
    await history.getState().load();
    expect(history.getState().exportCsv().split('\r\n')[1]).toMatch(/^a,s,/);
    expect(JSON.parse(history.getState().exportJson())).toMatchObject({ events: [{ id: 'a' }] });
  });
});

describe('statut du dialogue', () => {
  it('est enregistré et survit aux mises à jour venues du moteur', async () => {
    const { history, store, emit } = setup();
    emit([{ kind: 'opened', event: ev('x', 1, { closed: false }) }]);
    await history.getState().setDialogStatus('x', 'asked');
    emit([{ kind: 'updated', event: ev('x', 1, { closed: false }) }]);
    expect(history.getState().events[0]?.dialogStatus).toBe('asked');
    expect(store.updateDialogStatus).toHaveBeenCalledWith('x', 'asked');
  });
});
