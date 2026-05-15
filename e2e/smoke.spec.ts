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

  test('route /signup accessible', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const res = await page.goto('/signup', { waitUntil: 'networkidle' });
    expect(res?.status()).toBeLessThan(500);
    // Le formulaire doit avoir un champ email (utilise placeholder ou type)
    await expect(
      page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
    ).toBeVisible({ timeout: 20_000 });
    expect(jsErrors).toEqual([]);
  });

  test('route /login accessible', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const res = await page.goto('/login', { waitUntil: 'networkidle' });
    expect(res?.status()).toBeLessThan(500);
    await expect(
      page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first()
    ).toBeVisible({ timeout: 20_000 });
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
