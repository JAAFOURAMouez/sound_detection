// Persistance locale (IndexedDB via Dexie) : sessions, événements, courbe du score.
// Rien ne quitte le navigateur ; l'utilisateur peut tout exporter ou tout supprimer.

import Dexie, { type EntityTable } from 'dexie';
import type { SoundEvent } from './types';

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  source: 'mic' | 'demo';
  classifier: string;
}

/** Score d'anomalie à 1 Hz, regroupé par minute (60 valeurs, NaN = pas de mesure). */
export interface ScoreChunk {
  key: string;
  sessionId: string;
  minute: number;
  values: number[];
}

export const RETENTION_DAYS = 30;

export class SoundGuardDb extends Dexie {
  sessions!: EntityTable<SessionRecord, 'id'>;
  events!: EntityTable<SoundEvent, 'id'>;
  scores!: EntityTable<ScoreChunk, 'key'>;

  constructor(name = 'soundguard') {
    super(name);
    this.version(1).stores({
      sessions: 'id, startedAt',
      events: 'id, sessionId, start, type, family',
      scores: 'key, sessionId, minute',
    });
  }
}

export class EventStore {
  constructor(readonly db: SoundGuardDb = new SoundGuardDb()) {}

  async startSession(session: SessionRecord): Promise<void> {
    await this.db.sessions.put(session);
  }

  async endSession(id: string, endedAt: number): Promise<void> {
    await this.db.sessions.update(id, { endedAt });
  }

  async saveEvent(event: SoundEvent): Promise<void> {
    await this.db.events.put(event);
  }

  async updateNote(id: string, note: string): Promise<void> {
    await this.db.events.update(id, { note });
  }

  /** Enregistre une mesure de score (1 Hz) dans le bloc de sa minute. */
  async recordScore(sessionId: string, t: number, score: number): Promise<void> {
    const minute = Math.floor(t / 60_000);
    const key = `${sessionId}:${String(minute)}`;
    const second = Math.floor((t % 60_000) / 1_000);
    await this.db.transaction('rw', this.db.scores, async () => {
      const chunk = (await this.db.scores.get(key)) ?? {
        key,
        sessionId,
        minute,
        values: Array<number>(60).fill(Number.NaN),
      };
      chunk.values[second] = score;
      await this.db.scores.put(chunk);
    });
  }

  async listEvents(): Promise<SoundEvent[]> {
    return this.db.events.orderBy('start').toArray();
  }

  async listSessions(): Promise<SessionRecord[]> {
    return this.db.sessions.orderBy('startedAt').toArray();
  }

  /** Série (t, score) d'une session, dans l'ordre. */
  async scoreSeries(sessionId: string): Promise<{ t: number; score: number }[]> {
    const chunks = await this.db.scores.where('sessionId').equals(sessionId).sortBy('minute');
    return chunks.flatMap((c) =>
      c.values.flatMap((v, i) =>
        Number.isNaN(v) ? [] : [{ t: c.minute * 60_000 + i * 1_000, score: v }],
      ),
    );
  }

  /** Supprime ce qui a plus de `days` jours. */
  async purgeOlderThan(now: number, days = RETENTION_DAYS): Promise<number> {
    const limit = now - days * 86_400_000;
    const old = await this.db.sessions.where('startedAt').below(limit).primaryKeys();
    await this.db.transaction(
      'rw',
      [this.db.sessions, this.db.events, this.db.scores],
      async () => {
        await this.db.events.where('start').below(limit).delete();
        await this.db.scores.where('sessionId').anyOf(old).delete();
        await this.db.sessions.bulkDelete(old);
      },
    );
    return old.length;
  }

  async clearAll(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.sessions, this.db.events, this.db.scores],
      async () => {
        await Promise.all([
          this.db.sessions.clear(),
          this.db.events.clear(),
          this.db.scores.clear(),
        ]);
      },
    );
  }
}
