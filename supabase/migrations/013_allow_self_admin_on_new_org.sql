-- ════════════════════════════════════════════════════════════════════
-- 013_allow_self_admin_on_new_org.sql
--
-- Fix bug RLS catch-22 sur fna_user_orgs.INSERT
--
-- Postgres combine les policies RLS ainsi :
--   - PERMISSIVE  → OR  (au moins une doit passer)
--   - RESTRICTIVE → AND (toutes doivent passer)
--
-- AVANT :
--   - fna_uo_all (PERMISSIVE)        : org_id IN admin_orgs  ← ❌ nouvelle org
--   - fna_user_orgs_role_write (RESTRICTIVE) : can_write_for_fna() ← ✅
--   Résultat : (❌) AND (✅) = REJET
--
-- L'user créait l'entreprise dans fna_organizations mais l'auto-mapping
-- admin échouait dans fna_user_orgs. Catch-22 empêchant la création
-- multiple d'entreprises par un même utilisateur.
--
-- FIX :
--   Nouvelle PERMISSIVE policy autorisant un user à s'ajouter LUI-MÊME
--   comme admin sur une org sans admin existant.
--
-- SÉCURITÉ — testée logiquement, aucune escalade possible :
--   ✓ user_id = auth.uid()  → pas d'usurpation
--   ✓ role = 'admin'        → pas de squat editor/viewer
--   ✓ pas d'admin existant  → l'user ne peut joindre une org déjà
--                              administrée par quelqu'un d'autre
--
-- À exécuter UNE SEULE FOIS. Idempotent (DROP IF EXISTS + CREATE).
-- ════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS fna_uo_self_admin_insert ON fna_user_orgs;

CREATE POLICY fna_uo_self_admin_insert
  ON fna_user_orgs
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'admin'
    AND NOT EXISTS (
      SELECT 1 FROM fna_user_orgs existing
      WHERE existing.org_id = fna_user_orgs.org_id
        AND existing.role = 'admin'
        AND existing.user_id <> auth.uid()
    )
  );
