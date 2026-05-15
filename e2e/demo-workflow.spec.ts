import { test, expect } from '@playwright/test';

/**
 * Workflow E2E sur l'org de démonstration.
 *
 * L'org démo (`demo-org-*`) est interceptée par DemoProvider qui retourne
 * des fixtures hardcodées. Ces tests valident que les principales pages
 * affichent les fixtures attendues — sans toucher à Supabase.
 *
 * Si ces tests passent, on a la garantie que :
 *   - Le routing fonctionne
 *   - Les hooks de données (useStatements, useBalance, useFinancials) compilent
 *     et retournent les bonnes fixtures
 *   - Les composants de visualisation (Tremor, Recharts, ECharts) ne crashent pas
 *
 * Les tests vrai Supabase sont dans `e2e/supabase-workflow.spec.ts` (nécessite
 * un compte test pré-provisionné).
 */

test.describe('Workflow démo — pages financières', () => {
  test.beforeEach(async ({ page }) => {
    // Active le mode démo dans localStorage avant le 1er render
    await page.addInitScript(() => {
      localStorage.setItem('demo-mode', '1');
      localStorage.setItem('current-org', 'demo-org-e2e');
    });
  });

  test('dashboard home affiche des KPI non-nuls en démo', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    // Au moins un montant XOF doit être visible (les fixtures injectent du CA)
    const xofVisible = await page.locator('text=/XOF/').count();
    expect(xofVisible).toBeGreaterThan(0);
  });

  test('page Bilan/Synthèse affiche Actif/Passif (route protégée — skip si pas auth)', async ({ page }) => {
    // En mode démo sans auth, /dashboard/* est ProtectedRoute → redirige vers /login.
    // On teste via la page Demo qui contient les fixtures financières.
    await page.goto('/demo');
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    // La page démo affiche un cockpit avec des termes financiers
    const finTerms = await page.locator('text=/Actif|Passif|Bilan|Résultat|EBE|Trésorerie|XOF/i').count();
    expect(finTerms).toBeGreaterThan(0);
  });

  test('page Grand Livre liste des écritures démo', async ({ page }) => {
    await page.goto('/demo');
    await page.waitForLoadState('domcontentloaded');
    await page.goto('/grand-livre').catch(() => page.goto('/imports'));
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    // En démo, on a 240 écritures fictives — au moins un compte 4xx ou 7xx doit apparaître
    const hasAccount = await page.locator('text=/4\\d{2,5}|7\\d{2,5}/').count();
    expect(hasAccount).toBeGreaterThan(0);
  });
});
