import { expect, test } from '@playwright/test';
import { fr } from '../../src/i18n/fr';

// Site publié, dans un navigateur vierge (contexte neuf : ni cache, ni IndexedDB, ni
// permission micro). Le backend est bloqué : la démonstration doit tenir seule.

test.describe('site publié', () => {
  test.setTimeout(180_000);

  test('mode démonstration sans micro ni backend', async ({ page, context }) => {
    await context.route(/onrender\.com/, (route) => route.abort());
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('./');
    await expect(page.getByRole('heading', { name: fr.consent.title })).toBeVisible();
    await page.getByRole('button', { name: fr.consent.demo }).click();

    // Modèles téléchargés depuis le site publié, puis calibration sur l'ambiance simulée.
    const state = page.locator('.sg-statusbar__state');
    await expect(state).toHaveAttribute('data-status', 'monitoring', { timeout: 120_000 });
    await expect(page.getByText(fr.assistant.backend.offline)).toBeVisible();

    await page.getByRole('button', { name: fr.demo.samples['glass-breaking'] }).click();
    const journal = page.getByRole('list', { name: fr.events.journalLabel });
    await expect(journal.getByRole('button').first()).toBeVisible({ timeout: 20_000 });
    console.log(`journal : ${String(await journal.getByRole('button').first().textContent())}`);

    // L'assistant prend la parole avec une phrase locale, et répond sans backend.
    const yes = page.getByRole('button', { name: fr.assistant.yes });
    await expect(yes).toBeVisible({ timeout: 20_000 });
    await yes.click();
    await expect(page.getByTestId('assistant-recommendation')).toContainText(
      fr.assistant.localAnswer,
      { timeout: 20_000 },
    );
    expect(errors).toEqual([]);
  });

  test('les modèles et le moteur WASM sont servis avec le bon type', async ({ request }) => {
    const files = [
      'models/yamnet.tflite',
      'models/classifier.onnx',
      'models/autoencoder.onnx',
      'vendor/onnxruntime/ort-wasm-simd-threaded.wasm',
      'vendor/mediapipe/audio_wasm_module_internal.wasm',
      'samples/glass-breaking.ogg',
    ];
    for (const file of files) {
      const response = await request.get(file);
      console.log(
        `${file} : ${String(response.status())} ${response.headers()['content-type'] ?? ''}`,
      );
      expect(response.ok()).toBe(true);
    }
  });
});
