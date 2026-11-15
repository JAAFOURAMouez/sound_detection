// Rapport de session : métadonnées envoyées au backend (jamais d'audio), et synthèse locale
// de secours quand le backend dort ou ne répond pas.

import { familyLabel } from '../ui/labels';
import type { SessionRecord } from './db';
import type { SoundEvent } from './types';

export const REPORT_MAX_EVENTS = 500;
const NOTE_MAX = 500;

export interface ReportPayload {
  events: {
    type: SoundEvent['type'];
    family: string | null;
    family_label: string | null;
    severity: number;
    started_at: string;
    duration_s: number;
    note: string;
  }[];
  session_minutes: number;
}

export interface SessionReport {
  summary: string;
  highlights: string[];
  /** Vrai si la synthèse vient des gabarits (backend absent ou réponse invalide). */
  fallback: boolean;
}

/** Les événements d'une session, réduits à ce que le rapport a besoin de savoir. */
export function toReportPayload(
  session: Pick<SessionRecord, 'startedAt' | 'endedAt'>,
  events: SoundEvent[],
  now: number,
): ReportPayload {
  const end = session.endedAt ?? now;
  return {
    events: events.slice(-REPORT_MAX_EVENTS).map((e) => ({
      type: e.type,
      family: e.family,
      family_label: e.family ? familyLabel(e.family) : null,
      severity: e.severity,
      started_at: new Date(e.start).toISOString(),
      duration_s: Math.min(86_400, Math.max(0, (e.end - e.start) / 1000)),
      note: e.note.slice(0, NOTE_MAX),
    })),
    session_minutes: Math.min(100_000, Math.max(0, (end - session.startedAt) / 60_000)),
  };
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Synthèse par gabarits : mêmes règles que le repli du backend. */
export function localReport(payload: ReportPayload): SessionReport {
  const { events } = payload;
  if (events.length === 0) {
    return {
      summary: 'Aucun événement pendant cette session : ambiance calme.',
      highlights: [],
      fallback: true,
    };
  }
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'drift') continue;
    const name = e.family_label ?? e.family ?? 'inconnu';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const serious = events.filter((e) => e.severity >= 2);
  const parts = [
    `${String(events.length)} ${events.length > 1 ? 'événements' : 'événement'} pendant la session.`,
  ];
  if (counts.size > 0) {
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, n]) => `${name} (${String(n)})`)
      .join(', ');
    parts.push(`Les plus fréquents : ${top}.`);
  }
  parts.push(
    serious.length > 0
      ? `${String(serious.length)} ${serious.length > 1 ? 'méritaient' : 'méritait'} une vérification.`
      : 'Aucun ne semblait grave.',
  );
  const highlights = [...serious]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5)
    .map(
      (e) =>
        `${hhmm(e.started_at)} — ${e.family_label ?? e.family ?? 'son inconnu'}` +
        (e.note ? ` : ${e.note}` : ''),
    );
  return { summary: parts.join(' '), highlights, fallback: true };
}
