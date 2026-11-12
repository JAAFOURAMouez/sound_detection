import { expect, type Page, test } from '@playwright/test';
import { fr } from '../src/i18n/fr';

interface Probe {
  status: string;
  totalWritten: number;
  inputSampleRate: number;
}

async function probe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const state = window.__soundguard?.getState();
    return {
      status: state?.status ?? 'absent',
      totalWritten: state?.session?.ring.totalWritten ?? 0,
      inputSampleRate: state?.session?.inputSampleRate ?? 0,
    };
  });
}

async function startListening(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: fr.consent.accept }).click();
  await expect(page.getByText(fr.main.micActive, { exact: true })).toBeVisible();
}

test.describe('micro autorisé', () => {
  test.use({ permissions: ['microphone'] });

  test('capture à 16 kHz dans le tampon circulaire', async ({ page }) => {
    await startListening(page);
    await expect(page.getByText(fr.status.monitoring, { exact: true })).toBeVisible();

    const start = await probe(page);
    const t0 = Date.now();
    await page.waitForTimeout(3_000);
    const end = await probe(page);
    const seconds = (Date.now() - t0) / 1_000;
    const rate = (end.totalWritten - start.totalWritten) / seconds;

    console.log(
      `fréquence native ${String(end.inputSampleRate)} Hz → ${rate.toFixed(0)} échantillons/s`,
    );
    expect(end.status).toBe('monitoring');
    // Blocs de 100 ms : on tolère ±10 % sur une mesure de 3 s.
    expect(rate).toBeGreaterThan(16_000 * 0.9);
    expect(rate).toBeLessThan(16_000 * 1.1);
  });

  test('reste à 60 images/s pendant l’écoute', async ({ page }) => {
    await startListening(page);
    await page.waitForTimeout(1_000);

    const stats = await page.evaluate(
      () =>
        new Promise<{ fps: number; longFrames: number; frames: number }>((resolve) => {
          const durationMs = 5_000;
          const times: number[] = [];
          const t0 = performance.now();
          const tick = (now: number) => {
            times.push(now);
            if (now - t0 < durationMs) requestAnimationFrame(tick);
            else {
              let longFrames = 0;
              for (let i = 1; i < times.length; i++) {
                const a = times[i] ?? 0;
                const b = times[i - 1] ?? 0;
                if (a - b > 50) longFrames++;
              }
              const elapsed = (times.at(-1) ?? t0) - (times[0] ?? t0);
              resolve({
                fps: ((times.length - 1) * 1_000) / elapsed,
                longFrames,
                frames: times.length,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
    );

    console.log(
      `${stats.fps.toFixed(1)} images/s sur 5 s (${String(stats.frames)} images, ${String(stats.longFrames)} > 50 ms)`,
    );
    expect(stats.fps).toBeGreaterThanOrEqual(55);
    expect(stats.longFrames).toBeLessThanOrEqual(2);
  });

  test('le vu-mètre réagit au signal', async ({ page }) => {
    await startListening(page);
    const meter = page.getByRole('meter', { name: fr.main.level });
    await expect
      .poll(async () => Number(await meter.getAttribute('aria-valuenow')), { timeout: 5_000 })
      .toBeGreaterThan(-60);
  });

  test('pause, reprise et arrêt', async ({ page }) => {
    await startListening(page);
    await page.getByRole('button', { name: fr.main.pause }).click();
    await expect(page.getByText(fr.main.micPaused, { exact: true })).toBeVisible();
    await expect(page.getByText(fr.status.paused, { exact: true })).toBeVisible();

    const paused = (await probe(page)).totalWritten;
    await page.waitForTimeout(1_000);
    expect((await probe(page)).totalWritten).toBe(paused);

    await page.getByRole('button', { name: fr.main.resume }).click();
    await expect(page.getByText(fr.main.micActive, { exact: true })).toBeVisible();
    await expect.poll(async () => (await probe(page)).totalWritten).toBeGreaterThan(paused);

    await page.getByRole('button', { name: fr.main.stop }).click();
    await expect(page.getByRole('heading', { name: fr.consent.title })).toBeVisible();
    expect((await probe(page)).status).toBe('idle');
  });
});

test.describe('micro refusé', () => {
  test.use({ permissions: [] });

  test('explique le refus sans planter et propose de réessayer', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByRole('button', { name: fr.consent.accept }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(fr.captureError.denied.title);
    await expect(page.getByRole('button', { name: fr.consent.retry })).toBeEnabled();
    await expect(page.getByText(fr.main.micActive, { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
