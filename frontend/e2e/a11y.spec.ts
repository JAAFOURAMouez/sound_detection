import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fr } from '../src/i18n/fr';

/** Règles WCAG 2.1 A et AA (contrastes compris) : aucune violation tolérée. */
async function expectAccessible(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = violations.map(
    (v) => `${v.id} (${String(v.nodes.length)}) : ${v.nodes[0]?.target.join(' ') ?? ''}`,
  );
  console.log(`${label} : ${String(violations.length)} violation(s)`);
  expect(summary, label).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(width);
}

/** Voix simulée longue : le dialogue reste ouvert pendant l'analyse. */
async function silentVoice(page: Page) {
  await page.addInitScript(() => {
    const synth = {
      speaking: false,
      getVoices: () => [],
      cancel() {},
      speak(u: { onend: (() => void) | null }) {
        setTimeout(() => u.onend?.(), 1_000);
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  });
}

async function startDemo(page: Page) {
  await page.getByRole('button', { name: fr.consent.demo }).click();
  await expect(page.locator('.sg-main')).toHaveAttribute('data-status', 'calibrating', {
    timeout: 120_000,
  });
}

for (const [theme, width] of [
  ['dark', 1280],
  ['dark', 380],
  ['light', 1280],
  ['light', 380],
] as const) {
  test.describe(`accessibilité — thème ${theme}, ${String(width)} px`, () => {
    test.setTimeout(240_000);
    test.use({ viewport: { width, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await silentVoice(page);
      if (theme === 'light') {
        await page.addInitScript(() => {
          localStorage.setItem('sg-theme', 'light');
        });
      }
    });

    test('tous les écrans, de la page d’accueil au dialogue', async ({ page }) => {
      await page.goto('/');
      await expectAccessible(page, 'consentement');
      await expectNoHorizontalScroll(page);

      await page.goto('/#a-propos');
      await expect(page.getByRole('heading', { level: 1, name: fr.about.title })).toBeVisible();
      await expectAccessible(page, 'à propos');
      await expectNoHorizontalScroll(page);

      await page.goto('/#historique');
      await expect(page.getByText(fr.history.empty)).toBeVisible();
      await expectAccessible(page, 'historique vide');

      await page.goto('/');
      await startDemo(page);
      await expectAccessible(page, 'calibration');
      await expectNoHorizontalScroll(page);

      await expect(page.locator('.sg-main')).toHaveAttribute('data-status', 'monitoring', {
        timeout: 60_000,
      });
      await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
      await expect(page.getByRole('group', { name: fr.assistant.quickReplies })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('.sg-main')).toHaveAttribute('data-status', 'dialogue');
      await expectAccessible(page, 'dialogue');
      await expectNoHorizontalScroll(page);

      await page.getByRole('link', { name: fr.nav.history }).click();
      await expect(page.getByTestId('timeline')).toBeVisible();
      await expectAccessible(page, 'historique');
      await expectNoHorizontalScroll(page);
    });
  });
}

test.describe('clavier et mouvement', () => {
  test.setTimeout(240_000);

  test('lien d’évitement, fiche ouverte au clavier, Échap et retour du focus', async ({ page }) => {
    await silentVoice(page);
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: fr.main.skip });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenu')).toBeFocused();

    await startDemo(page);
    await expect(page.locator('.sg-main')).toHaveAttribute('data-status', /monitoring|dialogue/, {
      timeout: 60_000,
    });
    await page.getByRole('button', { name: fr.demo.samples['alarm-siren'] }).click();
    const row = page
      .getByRole('list', { name: fr.events.journalLabel })
      .getByRole('button')
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.focus();
    await page.keyboard.press('Enter');
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(row).toBeFocused();
  });

  test('mouvement réduit : balayage figé, sans lignes de balayage', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await startDemo(page);
    await expect(page.locator('.sg-main')).toHaveAttribute('data-status', 'monitoring', {
      timeout: 60_000,
    });
    const snapshot = () =>
      page.evaluate(() =>
        document.querySelector<HTMLCanvasElement>('.sg-radar__canvas')?.toDataURL(),
      );
    const first = await snapshot();
    await page.waitForTimeout(400);
    expect(await snapshot()).toBe(first);
    const scanlines = await page.evaluate(
      () => getComputedStyle(document.querySelector('.sg-main') as Element, '::after').content,
    );
    expect(scanlines).toBe('none');
  });
});
