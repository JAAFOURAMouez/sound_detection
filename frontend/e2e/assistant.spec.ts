import { expect, type Page, test } from '@playwright/test';
import { fr } from '../src/i18n/fr';

/**
 * Synthèse vocale simulée : chaque phrase « dure » `ms` millisecondes, comme une vraie voix
 * (Chromium headless n'a souvent aucune voix et termine aussitôt).
 */
async function fakeVoice(page: Page, ms = 4_000) {
  await page.addInitScript((duration) => {
    const synth = {
      speaking: false,
      getVoices: () => [],
      cancel() {
        this.speaking = false;
      },
      speak(u: { onend: (() => void) | null }) {
        this.speaking = true;
        setTimeout(() => {
          this.speaking = false;
          u.onend?.();
        }, duration);
      },
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  }, ms);
}

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: fr.consent.demo }).click();
  await expect
    .poll(() => page.evaluate(() => window.__soundguard?.getState().status), { timeout: 120_000 })
    .toBe('monitoring');
}

const line = (page: Page) => page.getByTestId('assistant-line');
const sessionEvents = (page: Page) =>
  page.evaluate(() => {
    const h = window.__soundguardHistory;
    const session = h?.recorder.session;
    return (h?.store.getState().events ?? [])
      .filter((e) => e.sessionId === session)
      .map((e) => ({
        id: e.id,
        type: e.type,
        family: e.family,
        dialogStatus: e.dialogStatus,
        start: e.start,
      }));
  });

test.describe('assistant vocal', () => {
  test.setTimeout(240_000);

  test('parcours complet : interpellation, réponse au clavier, analyse du backend', async ({
    page,
  }) => {
    await fakeVoice(page, 1_500);
    await startDemo(page);
    await expect(page.getByText(fr.assistant.backend.online)).toBeVisible();
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();

    // L'assistant prend l'initiative avec une phrase locale.
    await expect(line(page)).toContainText(/bruit inhabituel|verre/, { timeout: 15_000 });
    const input = page.getByLabel(fr.assistant.inputLabel);
    await expect(input).toBeVisible();
    await input.fill('oui');
    await input.press('Enter');

    // Réponse du backend (fournisseur mock) : recommandation sans repli local.
    const recommendation = page.getByTestId('assistant-recommendation');
    await expect(recommendation).toBeVisible({ timeout: 15_000 });
    await expect(recommendation).not.toContainText(fr.assistant.localAnswer);
    console.log(`assistant : ${String(await line(page).textContent())}`);
    console.log(`recommandation : ${String(await recommendation.textContent())}`);

    await expect
      .poll(async () => (await sessionEvents(page)).some((e) => e.dialogStatus === 'answered'))
      .toBe(true);
  });

  test('l’origine du son donnée par l’utilisateur rejoint le journal', async ({ page }) => {
    await fakeVoice(page, 1_000);
    await startDemo(page);
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    const input = page.getByLabel(fr.assistant.inputLabel);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill('c’est le chat qui a fait tomber un verre');
    await input.press('Enter');

    await expect(line(page)).toContainText('noté dans le journal', { timeout: 10_000 });
    const journal = page.getByRole('list', { name: fr.events.journalLabel });
    await expect(journal).toContainText('c’est le chat qui a fait tomber un verre');
    const notes = await page.evaluate(() =>
      (window.__soundguardHistory?.store.getState().events ?? []).map((e) => e.note),
    );
    console.log(`notes : ${JSON.stringify(notes)}`);
    expect(notes).toContain('c’est le chat qui a fait tomber un verre');
  });

  test('sans backend : réponse locale et indicateur hors ligne', async ({ page }) => {
    await fakeVoice(page, 1_000);
    await page.route('**/api/**', (route) => route.abort());
    await startDemo(page);
    await expect(page.getByText(fr.assistant.backend.offline)).toBeVisible();
    await page.getByRole('button', { name: fr.demo.samples['alarm-siren'] }).click();
    await expect(page.getByRole('button', { name: fr.assistant.yes })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: fr.assistant.yes }).click();
    const recommendation = page.getByTestId('assistant-recommendation');
    await expect(recommendation).toContainText(fr.assistant.localAnswer, { timeout: 15_000 });
  });

  test('ne se déclenche pas sur sa propre voix', async ({ page }) => {
    await fakeVoice(page, 5_000);
    await startDemo(page);
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    await expect
      .poll(() => page.evaluate(() => window.__soundguardHistory?.recorder.muted), {
        timeout: 15_000,
      })
      .toBe(true);
    const before = await sessionEvents(page);

    // Un son fort pendant que l'assistant parle (la synthèse dure 5 s) : la détection est en sourdine.
    await page.evaluate(() => window.__soundguard?.getState().playSample('impact-thud'));
    await page.waitForTimeout(3_000);
    expect(await page.evaluate(() => window.__soundguardHistory?.recorder.muted)).toBe(true);
    const during = await sessionEvents(page);
    console.log(
      `événements avant ${String(before.length)}, pendant la parole ${String(during.length)}`,
    );
    expect(during.map((e) => e.id)).toEqual(before.map((e) => e.id));
  });

  test('au plus une interpellation toutes les 30 s', async ({ page }) => {
    await fakeVoice(page, 1_000);
    await startDemo(page);
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    await expect(page.getByRole('button', { name: fr.assistant.no })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: fr.assistant.no }).click();
    await expect(line(page)).toContainText('je continue d’écouter');

    // 10 s plus tard, une sirène : un événement de plus, mais pas de nouvelle interpellation.
    await page.waitForTimeout(8_000);
    await page.getByRole('button', { name: fr.demo.samples['alarm-siren'] }).click();
    await expect
      .poll(async () => (await sessionEvents(page)).length, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(2);
    await page.waitForTimeout(3_000);
    const events = await sessionEvents(page);
    const asked = events.filter((e) => e.dialogStatus !== 'none');
    console.log(
      `événements : ${events.map((e) => `${e.family ?? e.type}=${e.dialogStatus}`).join(', ')}`,
    );
    expect(asked).toHaveLength(1);
    await expect(page.getByRole('button', { name: fr.assistant.yes })).toHaveCount(0);
  });
});
