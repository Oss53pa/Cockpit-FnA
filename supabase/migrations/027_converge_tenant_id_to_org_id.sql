-- ════════════════════════════════════════════════════════════════════
-- 027 — Convergence de la convention multi-tenant : tenant_id uuid → org_id text
-- ════════════════════════════════════════════════════════════════════
-- Contexte : des modules d'échafaudage (ventilation analytique, CAPEX,
-- immobilisations, inventaire physique) utilisaient `tenant_id uuid` +
-- policies `tenant_id = get_user_company_id()`, incohérents avec le cœur
-- applicatif (`org_id text` + `fna_auth_org_ids()`).
--
-- Ces 14 tables sont VIDES (hors 4 lignes de seed dans fna_capex_approval_matrix)
-- et NON référencées par le code applicatif → convergence sans risque.
--
-- Pour chaque table : suppression des policies (elles référencent tenant_id),
-- renommage tenant_id→org_id + conversion uuid→text, recréation des policies
-- RLS standard (lecture = membre ; écriture = editor ; suppression = admin).

DO $mig$
DECLARE
  t text;
  pol record;
  tables text[] := array[
    'fna_allocation_key','fna_allocation_key_value','fna_allocation_rule','fna_allocation_run',
    'fna_asset_disposal','fna_asset_maintenance',
    'fna_capex_approval','fna_capex_approval_matrix','fna_capex_note','fna_capex_pir','fna_car',
    'fna_inventory_count','fna_inventory_session','fna_secondary_transfer'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN tenant_id TO org_id', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id TYPE text USING org_id::text', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (org_id IN (SELECT fna_auth_org_ids()))', t||'_org_sel', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (org_id IN (SELECT fna_auth_org_ids(''editor'')))', t||'_org_ins', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (org_id IN (SELECT fna_auth_org_ids(''editor''))) WITH CHECK (org_id IN (SELECT fna_auth_org_ids(''editor'')))', t||'_org_upd', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (org_id IN (SELECT fna_auth_org_ids(''admin'')))', t||'_org_del', t);
  END LOOP;
END
$mig$;
