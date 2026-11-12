// Export de l'historique (fonctions pures) : JSON complet ou CSV des événements.

import type { SessionRecord } from './db';
import type { SoundEvent } from './types';

export function toJson(
  sessions: SessionRecord[],
  events: SoundEvent[],
  exportedAt: number,
): string {
  return JSON.stringify(
    {
      format: 'soundguard-history',
      version: 1,
      exportedAt: new Date(exportedAt).toISOString(),
      sessions,
      events,
    },
    null,
    2,
  );
}

const CSV_COLUMNS = [
  'id',
  'session',
  'debut',
  'fin',
  'duree_s',
  'type',
  'famille',
  'gravite',
  'confiance',
  'score_max',
  'niveau_max_db',
  'classes',
  'note',
] as const;

/** Échappe une cellule CSV (RFC 4180) et neutralise les formules des tableurs. */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  const numeric = /^-?\d+(\.\d+)?$/.test(text);
  if (!numeric && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(events: SoundEvent[]): string {
  const rows = events.map((e) =>
    [
      e.id,
      e.sessionId,
      new Date(e.start).toISOString(),
      new Date(e.end).toISOString(),
      ((e.end - e.start) / 1000).toFixed(1),
      e.type,
      e.family,
      e.severity,
      e.confidence.toFixed(3),
      e.scoreMax === null ? null : e.scoreMax.toFixed(3),
      e.levelDbMax === null ? null : e.levelDbMax.toFixed(1),
      e.topK.map((c) => `${c.name} ${c.score.toFixed(2)}`).join(' | '),
      e.note,
    ]
      .map(csvCell)
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\r\n') + '\r\n';
}
