-- ════════════════════════════════════════════════════════════════════
-- 024_budget_dedup_unique.sql
--
-- CORRIGE le gonflage des montants budgétaires (table de budget affichant
-- des valeurs ×N). Cause racine : `bulkUpsertBudgets` appelait `.upsert()`
-- SANS `onConflict`, et `fna_budgets` n'avait AUCUNE contrainte d'unicité
-- sur (org_id, year, version, account, month). Résultat : chaque
-- ré-import / sauvegarde INSÉRAIT des lignes en doublon au lieu de les
-- remplacer, et `loadBudget()` les ADDITIONNE (arr[m] += amount) → un même
-- couple (compte, mois) stocké N fois s'affiche à N × sa vraie valeur.
--
-- Constat terrain (org YOP) : ~32 copies identiques par (compte, mois),
-- donc des montants affichés à ~32× la réalité. Tous les doublons sont
-- STRICTEMENT identiques (vérifié : 0 groupe à montants divergents), donc
-- le dédoublonnage est sans perte.
--
-- Cette migration :
--   1. Dédoublonne l'existant (garde 1 ligne par couple-clé).
--   2. Ajoute un index UNIQUE pour rendre les upserts idempotents.
--
-- Côté code, `SupabaseProvider.bulkUpsertBudgets` passe désormais
-- `onConflict: 'org_id,year,version,account,month'` → l'upsert met à jour
-- en place au lieu d'empiler. Plus aucun doublon possible.
-- ════════════════════════════════════════════════════════════════════

-- 1) Dédoublonnage : ne conserver que la ligne la plus récente (id max)
--    de chaque couple (org_id, year, version, account, month).
DELETE FROM fna_budgets
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY org_id, year, version, account, month
             ORDER BY id DESC
           ) AS rn
    FROM fna_budgets
  ) ranked
  WHERE rn > 1
);

-- 2) Index UNIQUE : empêche structurellement tout futur doublon et sert de
--    cible au `onConflict` de l'upsert. (Un index unique suffit pour que
--    supabase-js résolve `onConflict` ; pas besoin d'une CONSTRAINT nommée.)
CREATE UNIQUE INDEX IF NOT EXISTS fna_budgets_unique_line
  ON fna_budgets (org_id, year, version, account, month);
