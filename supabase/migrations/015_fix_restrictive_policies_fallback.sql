-- ════════════════════════════════════════════════════════════════════
-- 015_fix_restrictive_policies_fallback.sql
--
-- Problème : les policies RESTRICTIVE *_role_write / *_role_update /
-- *_role_delete exigent can_write_for_fna() ou can_admin_for_fna()
-- qui dépendent de la chaîne licence_seats → products → apps (Atlas
-- Studio). Quand cette chaîne échoue (JWT partiel, session SSO
-- fraîche, cache PostgREST), les utilisateurs avec un rôle valide
-- dans fna_user_orgs se retrouvent bloqués en lecture seule.
--
-- Fix : ajouter un fallback sur fna_auth_org_ids() dans les policies
-- RESTRICTIVE. Ainsi un utilisateur admin/editor dans fna_user_orgs
-- peut toujours écrire, même si can_write_for_fna() échoue.
--
-- Pour fna_organizations INSERT spécifiquement, on vérifie que
-- l'utilisateur a AU MOINS une org (il est un user légitime de
-- Cockpit FnA), car la nouvelle org n'est pas encore dans
-- fna_user_orgs au moment de l'INSERT.
-- ════════════════════════════════════════════════════════════════════

-- ── Helper : l'user a-t-il au moins un lien fna_user_orgs ? ──────
CREATE OR REPLACE FUNCTION fna_user_has_any_org()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM fna_user_orgs WHERE user_id = auth.uid()
  );
$$;

-- ══════════════════════════════════════════════════════════════════
-- fna_organizations
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS fna_organizations_role_write ON fna_organizations;
CREATE POLICY fna_organizations_role_write ON fna_organizations AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR fna_user_has_any_org()
  );

DROP POLICY IF EXISTS fna_organizations_role_update ON fna_organizations;
CREATE POLICY fna_organizations_role_update ON fna_organizations AS RESTRICTIVE
  FOR UPDATE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_organizations_role_delete ON fna_organizations;
CREATE POLICY fna_organizations_role_delete ON fna_organizations AS RESTRICTIVE
  FOR DELETE
  USING (
    can_admin_for_fna()
    OR auth.role() = 'service_role'
    OR id IN (SELECT fna_auth_org_ids('admin'))
  );

-- ══════════════════════════════════════════════════════════════════
-- Macro : pour toutes les autres tables fna_*, même pattern.
-- L'utilisateur peut écrire si can_write_for_fna() OU s'il est
-- editor/admin dans fna_user_orgs pour au moins une org.
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fna_fiscal_years', 'fna_periods', 'fna_accounts', 'fna_account_mappings',
    'fna_gl_entries', 'fna_imports', 'fna_budgets', 'fna_reports',
    'fna_report_templates', 'fna_attention_points', 'fna_action_plans',
    'fna_channels', 'fna_chat_messages', 'fna_activities', 'fna_org_members',
    'fna_analytic_axes', 'fna_analytic_codes', 'fna_analytic_rules',
    'fna_analytic_assignments', 'fna_analytic_budgets',
    'fna_email_logs', 'fna_email_schedules', 'fna_period_audit_log',
    'fna_cr_models', 'fna_proph3_memory', 'fna_proph3_learning'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = t) THEN
      CONTINUE;
    END IF;

    -- INSERT (RESTRICTIVE)
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I',
      t || '_role_write', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR INSERT WITH CHECK (
        can_write_for_fna()
        OR auth.role() = ''service_role''
        OR EXISTS (SELECT 1 FROM fna_user_orgs WHERE user_id = auth.uid() AND role IN (''admin'', ''editor''))
      )',
      t || '_role_write', t
    );

    -- UPDATE (RESTRICTIVE)
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I',
      t || '_role_update', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR UPDATE USING (
        can_write_for_fna()
        OR auth.role() = ''service_role''
        OR EXISTS (SELECT 1 FROM fna_user_orgs WHERE user_id = auth.uid() AND role IN (''admin'', ''editor''))
      )',
      t || '_role_update', t
    );

    -- DELETE (RESTRICTIVE)
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I',
      t || '_role_delete', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE FOR DELETE USING (
        can_admin_for_fna()
        OR auth.role() = ''service_role''
        OR EXISTS (SELECT 1 FROM fna_user_orgs WHERE user_id = auth.uid() AND role = ''admin'')
      )',
      t || '_role_delete', t
    );
  END LOOP;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- fna_user_orgs : même traitement (pas dans la boucle car structure différente)
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS fna_user_orgs_role_write ON fna_user_orgs;
CREATE POLICY fna_user_orgs_role_write ON fna_user_orgs AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR (user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS fna_user_orgs_role_update ON fna_user_orgs;
CREATE POLICY fna_user_orgs_role_update ON fna_user_orgs AS RESTRICTIVE
  FOR UPDATE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM fna_user_orgs WHERE user_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS fna_user_orgs_role_delete ON fna_user_orgs;
CREATE POLICY fna_user_orgs_role_delete ON fna_user_orgs AS RESTRICTIVE
  FOR DELETE
  USING (
    can_admin_for_fna()
    OR auth.role() = 'service_role'
    OR EXISTS (SELECT 1 FROM fna_user_orgs WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ════════════════════════════════════════════════════════════════════
-- FIN — les policies RESTRICTIVE acceptent maintenant fna_user_orgs
-- comme fallback quand la chaîne licence_seats échoue.
-- ════════════════════════════════════════════════════════════════════
