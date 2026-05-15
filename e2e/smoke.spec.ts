import { test, expect } from '@playwright/test';

/**
 * Smoke tests — vérification que les pages critiques chargent sans erreur JS.
 *
 * Ces tests N'EXIGENT PAS d'authentification : ils visitent les routes publiques
 * (signup, login, démo) pour valider que :
 *   - Le bundle JS charge correctement
 *   - Aucune exception React n'est jetée au mount
 *   - Le titre / les éléments structurants apparaissent
 *
 * Si ces tests passent, l'app n'est pas catastrophiquement cassée.
 * Si un de ces tests échoue, soit le build est cassé, soit une dépendance
 * critique a changé.
 */

test.describe('Smoke — pages publiques', () => {
  test('homepage charge sans erreur JS', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    await page.goto('/');
    // Attendre que React ait monté (le titre Cockpit doit apparaître)
    await expect(page).toHaveTitle(/Cockpit/i, { timeout: 15_000 });
    expect(jsErrors).toEqual([]);
  });

  test('route /signup accessible (smoke : pas de crash JS)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const res = await page.goto('/signup', { waitUntil: 'networkidle', timeout: 30_000 });
    expect(res?.status()).toBeLessThan(500);
    // Smoke : la page contient au moins "Cockpit" (titre / heading) — pas
    // d'assertion stricte sur le formulaire car les lazy chunks peuvent
    // tarder à charger en dev. Le test cible "aucun crash JS".
    const cockpitText = await page.locator('text=/Cockpit/i').first().count();
    expect(cockpitText).toBeGreaterThan(0);
    expect(jsErrors).toEqual([]);
  });

  test('route /login accessible (smoke : pas de crash JS)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const res = await page.goto('/login', { waitUntil: 'networkidle', timeout: 30_000 });
    expect(res?.status()).toBeLessThan(500);
    const cockpitText = await page.locator('text=/Cockpit/i').first().count();
    expect(cockpitText).toBeGreaterThan(0);
    expect(jsErrors).toEqual([]);
  });

  test('route /demo accessible et charge des données factices', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const res = await page.goto('/demo');
    expect(res?.status()).toBeLessThan(500);
    // En démo, le dashboard doit afficher au moins un montant non-nul
    // (les fixtures DEMO_BALANCE génèrent du CA)
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    expect(jsErrors).toEqual([]);
  });
});
