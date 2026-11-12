import { describe, expect, it } from 'vitest';
import { csvCell, toCsv, toJson } from './exportData';
import type { SoundEvent } from './types';

const e: SoundEvent = {
  id: 'e1',
  sessionId: 's1',
  start: Date.UTC(2026, 10, 12, 22, 4, 12),
  end: Date.UTC(2026, 10, 12, 22, 4, 14),
  type: 'known',
  family: 'glass',
  severity: 2,
  topK: [
    { index: 435, name: 'Glass', score: 0.81, family: 'glass' },
    { index: 437, name: 'Shatter', score: 0.4, family: 'glass' },
  ],
  scoreMax: 0.66,
  confidence: 0.85,
  levelDbMax: -21.3,
  context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
  closed: true,
  dialogStatus: 'none',
  note: 'cuisine, "verre" cassé',
};

describe('export', () => {
  it('produit un CSV lisible par un tableur', () => {
    const lines = toCsv([e]).trimEnd().split('\r\n');
    expect(lines[0]).toBe(
      'id,session,debut,fin,duree_s,type,famille,gravite,confiance,score_max,niveau_max_db,classes,note',
    );
    expect(lines[1]).toBe(
      'e1,s1,2026-11-12T22:04:12.000Z,2026-11-12T22:04:14.000Z,2.0,known,glass,2,0.850,0.660,-21.3,Glass 0.81 | Shatter 0.40,"cuisine, ""verre"" cassé"',
    );
  });

  it('neutralise les formules et gère les valeurs absentes', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(null)).toBe('');
    expect(csvCell(-21.3)).toBe('-21.3');
  });

  it('produit un JSON complet et versionné', () => {
    const parsed = JSON.parse(toJson([], [e], Date.UTC(2026, 0, 1))) as {
      format: string;
      events: SoundEvent[];
    };
    expect(parsed.format).toBe('soundguard-history');
    expect(parsed.events[0]?.note).toBe(e.note);
  });
});
