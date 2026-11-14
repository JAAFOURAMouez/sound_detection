import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
import { AboutView } from './AboutView';
import { viewFromHash } from './views';

describe('AboutView', () => {
  it('explique l’architecture, la vie privée, les mesures et les limites', () => {
    render(<AboutView />);
    expect(screen.getByRole('heading', { level: 1, name: fr.about.title })).toBeInTheDocument();
    for (const title of [
      fr.about.chainTitle,
      fr.about.privacyTitle,
      fr.about.modelsTitle,
      fr.about.limitsTitle,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByRole('row', { name: /CNN maison.*82,8/ })).toBeInTheDocument();
    expect(screen.getByText(/appelle le 112/)).toBeInTheDocument();
    expect(screen.getByText(/ne quitte jamais le navigateur/)).toBeInTheDocument();
  });
});

describe('viewFromHash', () => {
  it('associe chaque fragment d’adresse à sa vue', () => {
    expect(viewFromHash('#historique')).toBe('history');
    expect(viewFromHash('#a-propos')).toBe('about');
    expect(viewFromHash('')).toBe('listen');
    expect(viewFromHash('#contenu')).toBe('listen');
  });
});
