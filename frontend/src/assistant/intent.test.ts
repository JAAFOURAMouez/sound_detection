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
    ['ça vient d’où', 'question'],
    ["C'est le chat", 'explain'],
    ['c’était juste moi', 'explain'],
    ['la porte a claqué', 'explain'],
    ['mon fils a fait tomber un verre', 'explain'],
    ["Non, c'est la porte d'entrée", 'explain'],
    ['oui c’est le voisin qui perce', 'explain'],
    ["j'ai fait tomber une assiette", 'explain'],
    ['ça vient de la cuisine', 'explain'],
    ['c’est la porte ?', 'question'],
    ['c’est bon', 'no'],
    ['c un chat', 'explain'],
    ['cest mon chien', 'explain'],
    ['chat', 'explain'],
    ['la télé', 'explain'],
    ['merci', 'no'],
    ['je ne sais pas trop ce que ça pourrait être en fait', 'question'],
  ])('« %s » → %s', (text, intent) => {
    expect(parseIntent(text)).toBe(intent);
  });

  it('traite une réponse vide comme un refus', () => {
    expect(parseIntent('   ')).toBe('no');
  });

  it('normalise accents, apostrophes et ponctuation', () => {
    expect(normalize('  Ça SUFFIT !  Arrête’  ')).toBe('ca suffit arrete');
    expect(normalize('C un chat')).toBe('c est un chat');
    expect(normalize("c'est le chat")).toBe('c est le chat');
  });
});
