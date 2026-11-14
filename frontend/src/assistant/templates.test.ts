import { describe, expect, it } from 'vitest';
import { fallbackAnswer, openingLine } from './templates';

describe('gabarits de l’assistant', () => {
  it('ouvre la conversation sans réseau, en restant prudent', () => {
    expect(openingLine({ type: 'unknown', family: null })).toBe(
      'J’ai détecté un bruit inhabituel. Souhaites-tu que j’analyse sa nature ?',
    );
    expect(openingLine({ type: 'known', family: 'glass' })).toContain('verre');
  });

  it('construit une réponse de repli proportionnée à la gravité', () => {
    const smoke = fallbackAnswer({
      type: 'known',
      family: 'smoke_fire',
      severity: 3,
      confidence: 0.94,
      scoreMax: 0.9,
    });
    expect(smoke.severity).toBe('alerte');
    expect(smoke.reply).toContain('94 %');
    expect(smoke.recommendation).toContain('112');
    expect(smoke.recommendation).toContain('pas un dispositif de sécurité certifié');
    expect(smoke.fallback).toBe(true);
    const unknown = fallbackAnswer({
      type: 'unknown',
      family: null,
      severity: 1,
      confidence: 0,
      scoreMax: 0.61,
    });
    expect(unknown).toMatchObject({ severity: 'verification' });
    expect(unknown.reply).toContain('0.61');
  });
});
