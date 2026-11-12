import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { EventStore, SoundGuardDb } from './db';
import type { SoundEvent } from './types';

const event = (id: string, start: number, sessionId = 's1'): SoundEvent => ({
  id,
  sessionId,
  start,
  end: start + 1_000,
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [{ index: 435, name: 'Glass', score: 0.8, family: 'glass' }],
  scoreMax: 0.7,
  confidence: 0.8,
  levelDbMax: -20,
  context: { families: [], meanLevelDb: -50, levelStdDb: 1, frames: 120 },
  closed: true,
  dialogStatus: 'none',
  note: '',
});

let n = 0;
const fresh = () => new EventStore(new SoundGuardDb(`test-${String(++n)}`));
const stores: EventStore[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.delete();
});

describe('EventStore', () => {
  it('enregistre et relit les événements dans l’ordre, y compris après réouverture', async () => {
    const store = fresh();
    stores.push(store);
    await store.startSession({
      id: 's1',
      startedAt: 0,
      endedAt: null,
      source: 'demo',
      classifier: 'yamnet',
    });
    await store.saveEvent(event('b', 2_000));
    await store.saveEvent(event('a', 1_000));
    await store.saveEvent({ ...event('a', 1_000), end: 9_000 }); // mise à jour
    store.db.close();
    const reopened = new EventStore(new SoundGuardDb(store.db.name));
    stores.push(reopened);
    const events = await reopened.listEvents();
    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(events[0]?.end).toBe(9_000);
    expect(await reopened.listSessions()).toHaveLength(1);
  });

  it('modifie la note d’un événement', async () => {
    const store = fresh();
    stores.push(store);
    await store.saveEvent(event('a', 1_000));
    await store.updateNote('a', 'c’était le chat');
    expect((await store.listEvents())[0]?.note).toBe('c’était le chat');
  });

  it('range le score à 1 Hz par minute et restitue la série', async () => {
    const store = fresh();
    stores.push(store);
    await store.recordScore('s1', 60_000 + 5_000, 0.2);
    await store.recordScore('s1', 60_000 + 6_400, 0.3);
    await store.recordScore('s1', 120_000, 0.9);
    expect(await store.scoreSeries('s1')).toEqual([
      { t: 65_000, score: 0.2 },
      { t: 66_000, score: 0.3 },
      { t: 120_000, score: 0.9 },
    ]);
    expect(await store.db.scores.count()).toBe(2);
  });

  it('purge les sessions anciennes et efface tout sur demande', async () => {
    const store = fresh();
    stores.push(store);
    const day = 86_400_000;
    await store.startSession({
      id: 'old',
      startedAt: 0,
      endedAt: 1,
      source: 'mic',
      classifier: 'yamnet',
    });
    await store.startSession({
      id: 'new',
      startedAt: 40 * day,
      endedAt: null,
      source: 'mic',
      classifier: 'yamnet',
    });
    await store.saveEvent(event('o', 10, 'old'));
    await store.saveEvent(event('n', 40 * day + 10, 'new'));
    await store.recordScore('old', 10, 0.1);
    expect(await store.purgeOlderThan(40 * day, 30)).toBe(1);
    expect((await store.listEvents()).map((e) => e.id)).toEqual(['n']);
    expect(await store.scoreSeries('old')).toEqual([]);
    await store.clearAll();
    expect(await store.listEvents()).toEqual([]);
    expect(await store.listSessions()).toEqual([]);
  });
});
