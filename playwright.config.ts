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
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:4173',
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

  // Utilise `vite preview` (build prod servi) au lieu de `vite dev` :
  // - Bundles pré-construits → pas de cold-start chunk-loading 30s+ par route
  // - Comportement identique à la prod → tests représentatifs
  // - Override possible via E2E_BASE_URL si serveur déjà lancé ailleurs
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000, // build peut prendre 1-2 min
      },
});
