import { expect, test } from '@playwright/test';
import { DEMO_AMBIENCE } from '../src/demo/samples';
import { fr } from '../src/i18n/fr';

const lab = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => typeof window.__soundguardLab?.simulate))
    .toBe('function');
};

test.describe('détection d’anomalies dans le navigateur', () => {
  test('ambiance calme calibrée : moins d’une fausse alerte par 10 minutes', async ({ page }) => {
    test.setTimeout(600_000);
    await lab(page);
    const report = await page.evaluate(
      (ambienceUrl) =>
        window.__soundguardLab?.simulate({ ambienceUrl, loops: 3, calibrationSeconds: 60 }),
      DEMO_AMBIENCE.file,
    );
    if (!report) throw new Error('banc d’essai absent');
    console.log(
      `ambiance ${(report.durationSeconds / 60).toFixed(1)} min (dont ${(report.monitoredSeconds / 60).toFixed(1)} min surveillées, ` +
        `${String(report.windows)} fenêtres) : ${String(report.falseAlerts.length)} fausse(s) alerte(s) ` +
        `[${report.falseAlerts.map((t) => t.toFixed(1)).join(', ')}] → ${report.falseAlertsPer10Min.toFixed(2)} / 10 min ; ` +
        `score lissé max ${report.maxScoreOutsideInjections.toFixed(3)}, score brut max ${report.maxRawOutsideInjections.toFixed(3)} ` +
        `(${String(report.rawAboveOutsideInjections)} fenêtres brutes ≥ 0,5), niveau max ${report.levelZMaxOutsideInjections.toFixed(1)} MAD ; ` +
        `${report.wallSeconds.toFixed(0)} s de calcul`,
    );
    expect(report.monitoredSeconds).toBeGreaterThanOrEqual(600);
    expect(report.falseAlertsPer10Min).toBeLessThan(1);
  });

  test('un son inconnu injecté dans l’ambiance dépasse le seuil', async ({ page }) => {
    test.setTimeout(600_000);
    await lab(page);
    const injections = [
      { url: 'samples/glass-breaking.ogg', atSeconds: 90, snrDb: 10 },
      { url: 'samples/impact-thud.ogg', atSeconds: 130, snrDb: 10 },
      { url: 'samples/alarm-siren.ogg', atSeconds: 170, snrDb: 10 },
      { url: 'samples/glass-breaking.ogg', atSeconds: 210, snrDb: 0 },
    ];
    const report = await page.evaluate(
      ({ ambienceUrl, injections: inj }) =>
        window.__soundguardLab?.simulate({
          ambienceUrl,
          loops: 1,
          calibrationSeconds: 60,
          injections: inj,
        }),
      { ambienceUrl: DEMO_AMBIENCE.file, injections },
    );
    if (!report) throw new Error('banc d’essai absent');
    for (const [i, r] of report.injections.entries()) {
      console.log(
        `${injections[i]?.url ?? ''} à ${String(r.atSeconds)} s, ${String(r.snrDb)} dB au-dessus de l’ambiance : ` +
          `score lissé max ${r.maxScore.toFixed(3)} (brut ${r.maxRaw.toFixed(3)}, niveau ${r.levelZMax.toFixed(1)} MAD), alerte ${r.alertAfterSeconds === null ? 'aucune' : `après ${r.alertAfterSeconds.toFixed(1)} s`}`,
      );
    }
    console.log(
      `hors injections : ${String(report.falseAlerts.length)} fausse(s) alerte(s), score lissé max ` +
        `${report.maxScoreOutsideInjections.toFixed(3)}, niveau max ${report.levelZMaxOutsideInjections.toFixed(1)} MAD`,
    );
    // Le critère : un son inconnu (verre brisé, classe jamais vue par l'autoencodeur) dépasse le seuil.
    expect(report.injections[0]?.maxScore).toBeGreaterThan(0.5);
    expect(report.injections[0]?.alertAfterSeconds).not.toBeNull();
  });

  test('démo en temps réel : calibration puis alerte sur un verre brisé', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByRole('button', { name: fr.consent.demo }).click();
    await expect(page.getByRole('progressbar', { name: fr.anomaly.calibrating })).toBeVisible({
      timeout: 60_000,
    });
    await expect
      .poll(() => page.evaluate(() => window.__soundguard?.getState().status), { timeout: 120_000 })
      .toBe('monitoring');
    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    await expect
      .poll(() => page.evaluate(() => window.__soundguard?.getState().alerts), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(
      page.getByText(
        new RegExp(`^(1 ${fr.anomaly.alertsOne}|([2-9]|\\d{2,}) ${fr.anomaly.alerts})$`),
      ),
    ).toBeVisible();
  });
});
