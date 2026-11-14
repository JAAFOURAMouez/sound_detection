import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { fr } from '../i18n/fr';
import { applyTheme, storedTheme } from './theme';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  applyTheme('dark');
});

describe('ThemeToggle', () => {
  it('bascule vers le papier millimétré, l’applique au document et s’en souvient', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: fr.theme.light });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(storedTheme()).toBe('light');
    fireEvent.click(button);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(storedTheme()).toBe('dark');
  });
});
