import { defineConfig, devices } from '@playwright/test';

// Vérification du site publié (GitHub Pages) : aucun serveur local, navigateur vierge.
const url = process.env.PUBLIC_URL ?? 'https://jaafouramouez.github.io/sound_detection/';

export default defineConfig({
  testDir: './e2e/public',
  workers: 1,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: url.endsWith('/') ? url : `${url}/`,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ordinateur', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'téléphone', use: { ...devices['Pixel 7'], channel: 'chromium' } },
  ],
});
