import { test, expect } from '@playwright/test';

/**
 * Workflow E2E spécifique au GL Tiers — couvre le chemin critique de
 * la refonte de cette session (Phases 1-3 + Round 4 review).
 *
 * Ces tests sont SKIP par défaut (test.skip) car ils nécessitent :
 *   1. Un compte de test authentifié sur Supabase (variables E2E_USER_EMAIL,
 *      E2E_USER_PASSWORD)
 *   2. Un org de test avec un GL pré-importé
 *   3. Les migrations 016-020 appliquées
 *
 * Pour les activer en CI : configurer les secrets puis retirer `test.skip`.
 *
 * Pour les lancer en local avec config :
 *   E2E_USER_EMAIL=test@example.com E2E_USER_PASSWORD=xxx npx playwright test tiers-import
 */

const SKIP = !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD;

test.describe('Workflow GL Tiers — refonte Phase 1-3', () => {
  test.skip(SKIP, 'Tests authentifiés — fournir E2E_USER_EMAIL et E2E_USER_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.E2E_USER_EMAIL!);
    await page.fill('input[type="password"]', process.env.E2E_USER_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|home/, { timeout: 15_000 });
  });

  test('page Imports Tiers affiche la zone de drop multi-fichiers', async ({ page }) => {
    await page.goto('/imports-tiers');
    await page.waitForLoadState('domcontentloaded');
    // Le label doit mentionner "plusieurs fichiers" depuis Phase 3
    await expect(page.locator('text=/plusieurs fichiers/i')).toBeVisible();
    // Et l'input file doit être multiple
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toHaveAttribute('multiple', '');
  });

  test('page Paramètres a un sélecteur Plan comptable', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    // Le champ Plan comptable doit apparaître dans la modale d'édition org
    // (Phase 3 — coa_system pluggable)
    const settingsHasCoaSelect = await page.locator('text=/Plan comptable/i').count();
    expect(settingsHasCoaSelect).toBeGreaterThan(0);
  });

  test('drag-and-drop dans MatchModal a un feedback visuel', async ({ page }) => {
    await page.goto('/imports-tiers');
    await page.waitForLoadState('networkidle');
    // Si des lignes unmatched existent, le bouton "Rattacher" doit être visible
    const rattacherCount = await page.locator('[title*="Rattacher"]').count();
    if (rattacherCount > 0) {
      await page.locator('[title*="Rattacher"]').first().click();
      // La modale doit ouvrir
      await expect(page.locator('text=/Rattacher manuellement/i')).toBeVisible({ timeout: 5000 });
      // La carte source doit être draggable
      const source = page.locator('text=/Ligne tiers source/').locator('..');
      await expect(source).toHaveAttribute('draggable', 'true');
    }
  });
});
