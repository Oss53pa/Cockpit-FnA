import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — tests E2E des workflows critiques de Cockpit FnA.
 *
 * Stratégie :
 * - Démarre `npm run dev` automatiquement (webServer)
 * - Cible Chromium uniquement (suffit pour valider workflow ; Safari/Firefox
 *   en CI Vercel séparément si besoin)
 * - 1 worker en local (évite races sur Supabase démo), 4 workers en CI
 * - Capture vidéo + trace sur failure pour debug rapide
 *
 * Pour lancer : `npx playwright test`
 * Pour debug : `npx playwright test --ui` ou `npx playwright test --headed`
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 1,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
