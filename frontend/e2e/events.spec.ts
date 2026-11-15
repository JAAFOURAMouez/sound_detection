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
    await expect(page.getByRole('status').filter({ hasText: /événements?$/ })).not.toHaveText(
      fr.history.count(0),
    );
    await expect(page.getByText('test de persistance')).toBeVisible();
    await expect(page.getByTestId('timeline')).toBeVisible();
  });

  test('l’extrait de réécoute contient le son, pas le calme qui suit', async ({ page }) => {
    await startDemo(page);
    await page.waitForTimeout(2_000);
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    const clipStats = () =>
      page.evaluate(() => {
        const h = window.__soundguardHistory;
        const session = h?.recorder.session;
        const event = (h?.store.getState().events ?? []).find(
          (e) => e.sessionId === session && e.closed && e.type !== 'drift',
        );
        const clip = event ? h?.recorder.clips.get(event.id) : undefined;
        if (!clip) return null;
        // Niveau par tranche de 0,25 s : le son doit dominer nettement le reste de l'extrait.
        const slice = 4_000;
        const rms: number[] = [];
        for (let i = 0; i + slice <= clip.length; i += slice) {
          let sum = 0;
          for (let j = i; j < i + slice; j++) sum += (clip[j] ?? 0) ** 2;
          rms.push(Math.sqrt(sum / slice));
        }
        return { seconds: clip.length / 16_000, rms };
      });
    await expect.poll(clipStats, { timeout: 20_000 }).not.toBeNull();
    const stats = await clipStats();
    if (!stats) throw new Error('extrait absent');
    const db = stats.rms.map((r) => 20 * Math.log10(Math.max(r, 1e-6)));
    console.log(
      `extrait : ${stats.seconds.toFixed(2)} s, niveaux ${db.map((d) => d.toFixed(0)).join(' ')} dBFS`,
    );
    const loudest = Math.max(...db);
    const quietest = Math.min(...db);
    expect(stats.seconds).toBeGreaterThanOrEqual(1);
    expect(loudest - quietest).toBeGreaterThan(12);
    // Le pic n'est pas dans la dernière tranche : l'extrait ne s'arrête pas avant le son.
    expect(db.indexOf(loudest)).toBeLessThan(db.length - 1);
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

  test('rapport de session : rédigé par le backend, ou localement sans lui', async ({ page }) => {
    await startDemo(page);
    await page.getByRole('button', { name: fr.demo.samples['alarm-siren'] }).click();
    await expect(
      page.getByRole('list', { name: fr.events.journalLabel }).getByRole('button').first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: fr.nav.history }).click();

    // Seules des métadonnées partent : on inspecte la requête envoyée au backend.
    const sent = page.waitForRequest('**/api/report');
    await page.getByRole('button', { name: fr.report.generate }).click();
    const body = (await sent).postDataJSON() as { events: Record<string, unknown>[] };
    console.log(`rapport envoyé : ${JSON.stringify(body.events[0])}`);
    expect(Object.keys(body.events[0] ?? {}).sort()).toEqual(
      ['duration_s', 'family', 'family_label', 'note', 'severity', 'started_at', 'type'].sort(),
    );
    await expect(page.getByText(fr.report.remote)).toBeVisible({ timeout: 15_000 });
    console.log(`rapport : ${String(await page.getByTestId('report-summary').textContent())}`);

    await page.route('**/api/**', (route) => route.abort());
    await page.getByRole('button', { name: fr.report.again }).click();
    await expect(page.getByText(fr.report.local)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('report-summary')).toContainText('pendant la session');
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
