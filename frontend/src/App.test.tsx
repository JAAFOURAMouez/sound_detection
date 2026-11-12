import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { fr } from './i18n/fr';

describe('App', () => {
  it('commence par l’écran de consentement, sans écouter', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: fr.consent.title })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: fr.consent.accept })).toBeEnabled();
  });
});
