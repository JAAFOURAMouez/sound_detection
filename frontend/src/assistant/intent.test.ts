import { describe, expect, it } from 'vitest';
import { normalize, parseIntent } from './intent';

describe('parseIntent', () => {
  it.each([
    ['Oui', 'yes'],
    ['ouais vas-y', 'yes'],
    ["D'accord", 'yes'],
    ['analyse', 'yes'],
    ['Non merci', 'no'],
    ['pas maintenant', 'no'],
    ["c'est rien", 'no'],
    ['Ignore ce type de bruit', 'ignore'],
    ['ne me signale plus ça', 'ignore'],
    ['Stop', 'stop'],
    ['tais-toi', 'stop'],
    ['Est-ce que c’était dangereux ?', 'question'],
    ['oui mais pourquoi tu penses que c’est du verre et pas une assiette', 'question'],
  ])('« %s » → %s', (text, intent) => {
    expect(parseIntent(text)).toBe(intent);
  });

  it('traite une réponse vide comme un refus', () => {
    expect(parseIntent('   ')).toBe('no');
  });

  it('normalise accents, apostrophes et ponctuation', () => {
    expect(normalize('  Ça SUFFIT !  Arrête’  ')).toBe('ca suffit arrete');
  });
});
