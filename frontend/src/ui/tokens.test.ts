import { describe, expect, it } from 'vitest';
import tokens from './tokens.css?raw';

/** Rapport de contraste WCAG 2.x entre deux couleurs #rrggbb. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0);
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

function parse(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/--sg-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

const [darkBlock = '', lightBlock = ''] = tokens.split(":root[data-theme='light']");
const dark = parse(darkBlock);
const themes = { sombre: dark, clair: { ...dark, ...parse(lightBlock) } };
const SURFACES = ['bg', 'surface', 'surface-raised'];
/** Jetons utilisés pour du texte (familles et gravité colorent aussi des libellés). */
const isTextToken = (name: string) => /^(text|severity-|family-)/.test(name) || name === 'phosphor';

describe('jetons de couleur', () => {
  it.each(Object.entries(themes))(
    'thème %s : tout texte atteint le contraste AA (4,5:1)',
    (_, t) => {
      const failures: string[] = [];
      for (const [name, color] of Object.entries(t)) {
        if (!isTextToken(name)) continue;
        for (const surface of SURFACES) {
          const ratio = contrast(color, t[surface] ?? '#000000');
          if (ratio < 4.5) failures.push(`${name} sur ${surface} : ${ratio.toFixed(2)}`);
        }
      }
      expect(failures).toEqual([]);
    },
  );

  it('le thème clair redéfinit toutes les couleurs de texte', () => {
    const light = parse(lightBlock);
    for (const name of Object.keys(dark).filter(isTextToken)) expect(light).toHaveProperty(name);
  });
});
