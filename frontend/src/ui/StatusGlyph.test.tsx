import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DISPLAY_STATUSES, displayStatus } from './displayStatus';
import { StatusGlyph } from './StatusGlyph';

describe('StatusGlyph', () => {
  it('donne à chaque état une forme distincte, sans recours à la couleur', () => {
    const shapes = DISPLAY_STATUSES.map((status) => {
      const { container, unmount } = render(<StatusGlyph status={status} />);
      // Seule la géométrie compte : on retire classes et couleurs.
      const svg = container.querySelector('svg');
      const shape = [...(svg?.children ?? [])]
        .map((el) => el.outerHTML.replace(/ (class|fill|stroke)="[^"]*"/g, ''))
        .join('');
      unmount();
      return shape;
    });
    expect(new Set(shapes).size).toBe(DISPLAY_STATUSES.length);
  });

  it('affiche le dialogue seulement pendant l’écoute', () => {
    expect(displayStatus('monitoring', true)).toBe('dialogue');
    expect(displayStatus('calibrating', true)).toBe('dialogue');
    expect(displayStatus('paused', true)).toBe('paused');
    expect(displayStatus('monitoring', false)).toBe('monitoring');
  });
});
