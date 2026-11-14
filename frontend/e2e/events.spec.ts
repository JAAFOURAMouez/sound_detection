import { expect, type Page, test } from '@playwright/test';
import { fr } from '../src/i18n/fr';

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: fr.consent.demo }).click();
  await expect
    .poll(() => page.evaluate(() => window.__soundguard?.getState().status), { timeout: 120_000 })
    .toBe('monitoring');
}

async function measureFps(page: Page, seconds = 5) {
  return page.evaluate(
    (ms) =>
      new Promise<{ fps: number; longFrames: number }>((resolve) => {
        const times: number[] = [];
        const t0 = performance.now();
        const tick = (now: number) => {
          times.push(now);
          if (now - t0 < ms) requestAnimationFrame(tick);
          else {
            let longFrames = 0;
            for (let i = 1; i < times.length; i++)
              if ((times[i] ?? 0) - (times[i - 1] ?? 0) > 50) longFrames++;
            const elapsed = (times.at(-1) ?? t0) - (times[0] ?? t0);
            resolve({ fps: ((times.length - 1) * 1000) / elapsed, longFrames });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
}

test.describe('événements et historique', () => {
  test.setTimeout(240_000);

  test('un verre brisé crée un événement qui survit au rechargement', async ({ page }) => {
    await startDemo(page);
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    const journal = page.getByRole('list', { name: fr.events.journalLabel });
    await expect(journal.getByRole('button').first()).toBeVisible({ timeout: 15_000 });
    const label = await journal.getByRole('button').first().textContent();
    console.log(`journal : ${String(label)}`);

    // Fiche de l'événement, note enregistrée.
    await journal.getByRole('button').first().click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    await sheet.getByLabel(fr.events.note).fill('test de persistance');
    await sheet.getByRole('button', { name: fr.events.saveNote }).click();
    await expect(sheet.getByRole('status')).toHaveText(fr.events.saved);
    await sheet.getByRole('button', { name: fr.events.close }).click();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          await window.__soundguardHistory?.recorder.flush();
          return true;
        }),
      )
      .toBe(true);

    await page.reload();
    await page.getByRole('link', { name: fr.nav.history }).click();
    await expect(page).toHaveURL(/#historique$/);
    await expect(page.getByRole('status').filter({ hasText: fr.history.count })).not.toHaveText(
      `0 ${fr.history.count}`,
    );
    await expect(page.getByText('test de persistance')).toBeVisible();
    await expect(page.getByTestId('timeline')).toBeVisible();
  });

  test('radar et frise restent fluides avec 500 événements', async ({ page }) => {
    await startDemo(page);
    const inserted = await page.evaluate(async () => {
      const h = window.__soundguardHistory;
      if (!h) throw new Error('point d’observation absent');
      const sessionId = h.recorder.session ?? 'test';
      const families = ['glass', 'alarm', 'impact', 'voice', 'mechanical', null] as const;
      const now = Date.now();
      const events = Array.from({ length: 500 }, (_, i) => {
        const family = families[i % families.length] ?? null;
        const start = now - 55_000 + i * 100; // toutes dans la dernière minute : 500 échos à l'écran
        return {
          id: `bulk-${String(i)}`,
          sessionId,
          start,
          end: start + 400,
          type: family ? ('known' as const) : ('unknown' as const),
          family,
          severity: (i % 4) as 0 | 1 | 2 | 3,
          topK: [],
          scoreMax: (i % 100) / 100,
          confidence: 0.7,
          levelDbMax: -30,
          context: { families: [], meanLevelDb: null, levelStdDb: null, frames: 0 },
          closed: true,
          dialogStatus: 'none' as const,
          note: '',
        };
      });
      await h.db.db.events.bulkPut(events);
      h.store.getState().applyChanges(events.map((event) => ({ kind: 'closed' as const, event })));
      return h.store.getState().events.length;
    });
    expect(inserted).toBeGreaterThanOrEqual(500);

    const radar = await measureFps(page);
    console.log(
      `écoute (radar + journal, 500 événements) : ${radar.fps.toFixed(1)} images/s, ${String(radar.longFrames)} > 50 ms`,
    );
    expect(radar.fps).toBeGreaterThanOrEqual(55);

    await page.getByRole('link', { name: fr.nav.history }).click();
    await expect(page.getByTestId('timeline')).toBeVisible();
    const history = await measureFps(page);
    console.log(
      `historique (frise, 500 événements) : ${history.fps.toFixed(1)} images/s, ${String(history.longFrames)} > 50 ms`,
    );
    expect(history.fps).toBeGreaterThanOrEqual(55);
  });

  test('l’historique peut être exporté puis entièrement supprimé', async ({ page }) => {
    await startDemo(page);
    await page.getByRole('button', { name: fr.demo.samples['alarm-siren'] }).click();
    await expect(
      page.getByRole('list', { name: fr.events.journalLabel }).getByRole('button').first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: fr.nav.history }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: fr.history.exportCsv }).click();
    const csv = await (await download).path();
    expect(csv).toBeTruthy();
    await page.getByRole('button', { name: fr.history.delete }).click();
    await page.getByRole('button', { name: fr.history.confirmDelete }).click();
    await expect(page.getByText(fr.history.empty)).toBeVisible();
    await page.reload();
    await expect(page.getByText(fr.history.empty)).toBeVisible();
  });
});
