import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { fr } from './i18n/fr';

describe('App', () => {
  it('affiche le nom et l’état initial', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: fr.app.name })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(fr.app.status);
  });
});
