-- ════════════════════════════════════════════════════════════════════
-- 014_fix_recursion_self_admin_insert.sql
--
-- Fix recursion infinie dans fna_uo_self_admin_insert (migration 013).
--
-- BUG :
--   Le NOT EXISTS (SELECT FROM fna_user_orgs ...) à l'intérieur du
--   WITH CHECK déclenche la policy SELECT sur fna_user_orgs qui
--   elle-même réfère à fna_user_orgs → Postgres détecte la recursion
--   infinie et bloque l'INSERT avec :
--     ERROR: infinite recursion detected in policy for relation
--            "fna_user_orgs"
--
-- IMPACT :
--   L'utilisateur ne pouvait toujours pas créer de 2ème entreprise.
--   - Étape 1 (fna_organizations) : ✅
--   - Étape 2 (fna_user_orgs admin) : ❌ recursion
--   - Étape 3 (fna_fiscal_years) : ❌ cascade (org_id pas dans
--                                          fna_auth_org_ids)
--   - Étape 4 (fna_periods) : ❌ idem
--
-- FIX :
--   Fonction SECURITY DEFINER `fna_org_has_other_admin` qui bypasse
--   RLS pour le check d'existence. Plus de recursion.
--
-- TESTÉ :
--   Simulation complète end-to-end (4/4 steps = OK) avec un user qui
--   a déjà 1 org admin. La 2ème org se crée correctement avec ses
--   fiscal_year et 12 periods.
--
-- SÉCURITÉ :
--   ✓ user_id = auth.uid()  → pas d'usurpation
--   ✓ role = 'admin'        → pas de squat editor/viewer
--   ✓ Le SECURITY DEFINER ne fait QUE EXISTS, pas de DML
--   ✓ GRANT EXECUTE uniquement à `authenticated`
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fna_org_has_other_admin(p_org_id text, p_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fna_user_orgs
    WHERE org_id = p_org_id
      AND role = 'admin'
      AND user_id <> p_user
  );
$$;

REVOKE ALL ON FUNCTION fna_org_has_other_admin(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION fna_org_has_other_admin(text, uuid) TO authenticated;

DROP POLICY IF EXISTS fna_uo_self_admin_insert ON fna_user_orgs;

CREATE POLICY fna_uo_self_admin_insert
  ON fna_user_orgs
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND NOT fna_org_has_other_admin(org_id, auth.uid())
  );
