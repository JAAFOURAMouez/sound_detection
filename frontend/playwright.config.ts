import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const API_PORT = 8000;

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
  webServer: [
    {
      // Build de production dédié aux tests : expose un point d'observation (VITE_E2E).
      command: `npm run build:e2e && npx vite preview --outDir dist-e2e --port ${String(PORT)} --strictPort`,
      url: `http://localhost:${String(PORT)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Backend réel avec le fournisseur `mock` : aucun réseau, aucune clé.
      command: `uv run --directory ../backend uvicorn app.main:app --port ${String(API_PORT)}`,
      url: `http://localhost:${String(API_PORT)}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        LLM_PROVIDER: 'mock',
        ALLOWED_ORIGINS: `http://localhost:${String(PORT)}`,
        RATE_LIMIT_PER_MINUTE: '1000',
      },
    },
  ],
});
