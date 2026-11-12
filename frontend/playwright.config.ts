import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
    locale: 'fr-FR',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Nouveau mode headless de Chromium : l'ancien « headless shell » ne gère pas
        // les permissions micro (getUserMedia y renvoie NotSupportedError).
        channel: 'chromium',
        launchOptions: {
          // Micro factice de Chromium : bip périodique, aucune vraie capture.
          args: ['--use-fake-device-for-media-stream'],
        },
      },
    },
  ],
  webServer: {
    // Build de production dédié aux tests : expose un point d'observation (VITE_E2E).
    command: `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
