import { describe, expect, it } from 'vitest';
import { localReport, REPORT_MAX_EVENTS, toReportPayload } from './report';
import type { SoundEvent } from './types';

const ev = (over: Partial<SoundEvent> = {}): SoundEvent => ({
  id: 'e1',
  sessionId: 'session-secrete',
  start: Date.UTC(2026, 10, 12, 22, 4, 12),
  end: Date.UTC(2026, 10, 12, 22, 4, 14),
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [{ index: 435, name: 'Glass', score: 0.8, family: 'glass' }],
  scoreMax: 0.62,
  confidence: 0.86,
  levelDbMax: -21,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: true,
  dialogStatus: 'none',
  note: '',
  ...over,
});

const session = { startedAt: Date.UTC(2026, 10, 12, 22, 0), endedAt: null };

describe('toReportPayload', () => {
  it('ne garde que les métadonnées utiles, sans identifiant ni scores bruts', () => {
    const payload = toReportPayload(
      session,
      [ev({ note: 'c’est le chat' })],
      session.startedAt + 600_000,
    );
    expect(payload.session_minutes).toBe(10);
    expect(payload.events).toEqual([
      {
        type: 'known',
        family: 'glass',
        family_label: 'verre',
        severity: 2,
        started_at: '2026-11-12T22:04:12.000Z',
        duration_s: 2,
        note: 'c’est le chat',
      },
    ]);
    expect(JSON.stringify(payload)).not.toContain('session-secrete');
  });

  it('respecte les limites du backend', () => {
    const many = Array.from({ length: REPORT_MAX_EVENTS + 20 }, (_, i) =>
      ev({ id: String(i), note: 'x'.repeat(900) }),
    );
    const payload = toReportPayload({ ...session, endedAt: session.startedAt + 1 }, many, 0);
    expect(payload.events).toHaveLength(REPORT_MAX_EVENTS);
    expect(payload.events[0]?.note).toHaveLength(500);
  });
});

describe('localReport', () => {
  it('décrit une session calme', () => {
    expect(localReport({ events: [], session_minutes: 5 })).toMatchObject({
      summary: 'Aucun événement pendant cette session : ambiance calme.',
      highlights: [],
      fallback: true,
    });
  });

  it('compte les familles et met en avant les événements à vérifier', () => {
    const payload = toReportPayload(
      session,
      [
        ev({ note: 'cuisine' }),
        ev({ type: 'unknown', family: null, severity: 1 }),
        ev({ family: 'alarm', severity: 3 }),
      ],
      session.startedAt,
    );
    const report = localReport(payload);
    expect(report.summary).toContain('3 événements pendant la session.');
    expect(report.summary).toContain('2 méritaient une vérification.');
    expect(report.highlights[0]).toContain('alarme');
    expect(report.highlights[1]).toContain('verre : cuisine');
  });
});
