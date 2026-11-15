// Historique des événements : chargement depuis IndexedDB, mises à jour en direct,
// sélection, filtres, notes, export et suppression.

import { createStore, useStore } from 'zustand';
import type { EventStore, SessionRecord } from '../events/db';
import type { EventChange } from '../events/engine';
import { appendNote } from '../assistant/templates';
import { toCsv, toJson } from '../events/exportData';
import type { EventRecorder } from '../events/recorder';
import type { EventType, SoundEvent } from '../events/types';
import { eventStore, recorder } from './services';

export type View = 'listen' | 'history' | 'about';

export interface HistoryFilters {
  family: string | null;
  types: EventType[];
  minSeverity: number;
}

export interface HistoryState {
  loaded: boolean;
  error: string | null;
  events: SoundEvent[];
  sessions: SessionRecord[];
  selectedId: string | null;
  view: View;
  filters: HistoryFilters;
  load: () => Promise<void>;
  applyChanges: (changes: EventChange[]) => void;
  select: (id: string | null) => void;
  setView: (view: View) => void;
  setFilters: (filters: Partial<HistoryFilters>) => void;
  updateNote: (id: string, note: string) => Promise<void>;
  /** L'utilisateur a donné l'origine du son : elle devient son identification et rejoint la note. */
  identify: (id: string, source: string) => Promise<void>;
  setDialogStatus: (id: string, status: SoundEvent['dialogStatus']) => Promise<void>;
  clearAll: () => Promise<void>;
  exportJson: () => string;
  exportCsv: () => string;
}

export const ALL_TYPES: EventType[] = ['known', 'unknown', 'drift'];

export function filterEvents(events: SoundEvent[], filters: HistoryFilters): SoundEvent[] {
  return events.filter(
    (e) =>
      filters.types.includes(e.type) &&
      e.severity >= filters.minSeverity &&
      (filters.family === null || e.family === filters.family),
  );
}

export interface HistoryDeps {
  store: Pick<
    EventStore,
    | 'listEvents'
    | 'listSessions'
    | 'updateNote'
    | 'updateUserSource'
    | 'updateDialogStatus'
    | 'clearAll'
    | 'purgeOlderThan'
  >;
  recorder: Pick<EventRecorder, 'subscribe' | 'flush' | 'clips'> | null;
  now: () => number;
}

export function createHistoryStore(deps: HistoryDeps) {
  const store = createStore<HistoryState>()((set, get) => ({
    loaded: false,
    error: null,
    events: [],
    sessions: [],
    selectedId: null,
    view: 'listen',
    filters: { family: null, types: [...ALL_TYPES], minSeverity: 0 },

    async load() {
      try {
        await deps.store.purgeOlderThan(deps.now());
        const [events, sessions] = await Promise.all([
          deps.store.listEvents(),
          deps.store.listSessions(),
        ]);
        // Les événements arrivés pendant le chargement sont conservés.
        const live = new Map(get().events.map((e) => [e.id, e]));
        for (const e of events) if (!live.has(e.id)) live.set(e.id, e);
        set({
          loaded: true,
          sessions,
          events: [...live.values()].sort((a, b) => a.start - b.start),
        });
      } catch (error) {
        set({ loaded: true, error: error instanceof Error ? error.message : String(error) });
      }
    },

    applyChanges(changes) {
      set((state) => {
        const events = [...state.events];
        for (const { event } of changes) {
          const i = events.findIndex((e) => e.id === event.id);
          // Le moteur ignore le dialogue (statut, note, identification) : on garde ce qui est connu.
          const known = i >= 0 ? events[i] : undefined;
          if (known)
            events[i] = {
              ...event,
              dialogStatus: known.dialogStatus,
              note: known.note || event.note,
              ...(known.userSource ? { userSource: known.userSource } : {}),
            };
          else events.push(event);
        }
        return { events };
      });
    },

    select(id) {
      set({ selectedId: id });
    },

    setView(view) {
      set({ view });
    },

    setFilters(filters) {
      set((state) => ({ filters: { ...state.filters, ...filters } }));
    },

    async updateNote(id, note) {
      set((state) => ({ events: state.events.map((e) => (e.id === id ? { ...e, note } : e)) }));
      await deps.recorder?.flush();
      await deps.store.updateNote(id, note);
    },

    async identify(id, source) {
      const current = get().events.find((e) => e.id === id);
      const note = appendNote(current?.note ?? '', source);
      set((state) => ({
        events: state.events.map((e) => (e.id === id ? { ...e, note, userSource: source } : e)),
      }));
      await deps.recorder?.flush();
      await deps.store.updateNote(id, note);
      await deps.store.updateUserSource(id, source);
    },

    async setDialogStatus(id, dialogStatus) {
      set((state) => ({
        events: state.events.map((e) => (e.id === id ? { ...e, dialogStatus } : e)),
      }));
      await deps.recorder?.flush();
      await deps.store.updateDialogStatus(id, dialogStatus);
    },

    async clearAll() {
      await deps.recorder?.flush();
      await deps.store.clearAll();
      deps.recorder?.clips.clear();
      set({ events: [], sessions: [], selectedId: null });
    },

    exportJson() {
      return toJson(get().sessions, get().events, deps.now());
    },

    exportCsv() {
      return toCsv(get().events);
    },
  }));
  deps.recorder?.subscribe((changes) => {
    store.getState().applyChanges(changes);
  });
  return store;
}

export const historyStore = createHistoryStore({
  store: eventStore,
  recorder,
  now: () => Date.now(),
});

export function useHistoryStore<T>(selector: (state: HistoryState) => T): T {
  return useStore(historyStore, selector);
}
