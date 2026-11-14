import { describe, expect, it } from 'vitest';
import { appendNote, explanationAnswer, fallbackAnswer, NOTE_MAX, openingLine } from './templates';

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

  it('ajoute l’explication à la note sans doublon ni dépassement', () => {
    expect(appendNote('', '  le chat ')).toBe('le chat');
    expect(appendNote('vu dans la cuisine', 'le chat')).toBe('vu dans la cuisine · le chat');
    expect(appendNote('le chat', 'le chat')).toBe('le chat');
    expect(appendNote('x'.repeat(NOTE_MAX), 'le chat')).toHaveLength(NOTE_MAX);
  });

  it('accuse réception de l’explication en restant prudent si le son était grave', () => {
    expect(explanationAnswer({ severity: 1 }, 'le chat.').reply).toContain('« le chat »');
    const serious = explanationAnswer({ severity: 3 }, 'je teste le détecteur');
    expect(serious.severity).toBe('verification');
    expect(serious.recommendation).toContain('vérifie');
  });
});
