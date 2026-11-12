import { expect, type Page, test } from '@playwright/test';
import { DEMO_SAMPLES, type DemoSample } from '../src/demo/samples';
import { fr } from '../src/i18n/fr';

interface Observation {
  family: string | null;
  score: number;
  receivedAt: number;
}

async function startDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: fr.consent.demo }).click();
  await expect(page.getByText(fr.main.demoMode, { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__soundguard?.getState().model.status), {
      timeout: 60_000,
    })
    .toBe('ready');
}

/** Joue un échantillon et renvoie les résultats reçus pendant sa lecture. */
async function play(page: Page, sample: DemoSample) {
  return page.evaluate(
    async ({ id, file }) => {
      const store = window.__soundguard;
      if (!store) throw new Error('point d’observation absent');
      const observations: Observation[] = [];
      const unsubscribe = store.subscribe((state, previous) => {
        if (state.live && state.live !== previous.live) {
          observations.push({
            family: state.live.dominant?.family ?? null,
            score: state.live.dominant?.score ?? 0,
            receivedAt: state.live.receivedAt,
          });
        }
      });
      await store.getState().playSample(id);
      const startedAt = store.getState().lastSample?.startedAt ?? 0;
      // Durée du fichier + marge pour les dernières fenêtres.
      const duration = await fetch(file).then(async (r) => {
        const ctx = new OfflineAudioContext(1, 1, 48_000);
        return (await ctx.decodeAudioData(await r.arrayBuffer())).duration;
      });
      await new Promise((resolve) => setTimeout(resolve, duration * 1_000 + 800));
      unsubscribe();
      return { startedAt, observations };
    },
    { id: sample.id, file: sample.file },
  );
}

function analyse(sample: DemoSample, run: Awaited<ReturnType<typeof play>>) {
  const onsetAt = run.startedAt + sample.onsetSeconds * 1_000;
  const during = run.observations.filter((o) => o.receivedAt >= onsetAt);
  const first = during.find((o) => o.family === sample.expectedFamily);
  // Famille de l'événement : la plus forte hors ambiance (le silence qui suit n'est pas l'événement).
  const strongest = during
    .filter((o) => o.family !== null && o.family !== 'ambient')
    .sort((a, b) => b.score - a.score)[0];
  return {
    latencyMs: first ? first.receivedAt - onsetAt : Number.POSITIVE_INFINITY,
    strongestFamily: strongest?.family ?? null,
    strongestScore: strongest?.score ?? 0,
  };
}

test.describe('classification YAMNet en mode démonstration', () => {
  test.setTimeout(180_000);

  test('les échantillons tombent dans la bonne famille, en moins de 1,5 s', async ({ page }) => {
    await startDemo(page);
    const latencies: number[] = [];
    // Trois passages sur les quatre échantillons : douze mesures de latence.
    for (let pass = 0; pass < 3; pass++) {
      for (const sample of DEMO_SAMPLES) {
        const result = analyse(sample, await play(page, sample));
        console.log(
          `${sample.id.padEnd(17)} attendu ${sample.expectedFamily.padEnd(10)} → ${String(result.strongestFamily).padEnd(10)} ` +
            `(score ${result.strongestScore.toFixed(2)}), latence ${result.latencyMs.toFixed(0)} ms`,
        );
        expect(result.strongestFamily, sample.id).toBe(sample.expectedFamily);
        latencies.push(result.latencyMs);
      }
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
    const max = sorted.at(-1) ?? Number.POSITIVE_INFINITY;
    console.log(
      `latence son → étiquette : médiane ${median.toFixed(0)} ms, max ${max.toFixed(0)} ms (n=${String(latencies.length)})`,
    );
    expect(max).toBeLessThan(1_500);
  });

  test('affiche le top-3 en direct', async ({ page }) => {
    await startDemo(page);
    const glass = DEMO_SAMPLES.find((s) => s.id === 'glass-breaking');
    if (!glass) throw new Error('échantillon manquant');
    await play(page, glass);
    await expect(page.locator('.sg-live__row')).toHaveCount(3);
  });

  test('met le modèle en cache et fonctionne sans le réseau au rechargement', async ({ page }) => {
    await startDemo(page);
    const first = await page.evaluate(() => window.__soundguard?.getState().model.info);
    expect(first?.fromCache).toBe(false);

    // Au rechargement, le réseau refuse le modèle, le runtime et la table des familles.
    const blocked: string[] = [];
    await page.context().route(/\/(models|vendor)\//, (route) => {
      blocked.push(route.request().url());
      return route.abort();
    });
    await page.reload();
    await page.getByRole('button', { name: fr.consent.demo }).click();
    await expect
      .poll(() => page.evaluate(() => window.__soundguard?.getState().model.status), {
        timeout: 30_000,
      })
      .toBe('ready');
    const second = await page.evaluate(() => window.__soundguard?.getState().model.info);
    console.log(
      `1er chargement ${String(first?.loadMs.toFixed(0))} ms, 2e (cache) ${String(second?.loadMs.toFixed(0))} ms, requêtes bloquées : ${String(blocked.length)}`,
    );
    expect(second?.fromCache).toBe(true);
    expect(blocked).toEqual([]);

    const glass = DEMO_SAMPLES.find((s) => s.id === 'glass-breaking');
    if (!glass) throw new Error('échantillon manquant');
    expect(analyse(glass, await play(page, glass)).strongestFamily).toBe('glass');
  });
});
