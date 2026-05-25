-- ════════════════════════════════════════════════════════════════════
-- 023_gl_tiers.sql
--
-- GRAND LIVRE TIERS (livre auxiliaire) — stocké comme un VRAI livre.
--
-- Avant : le GL Tiers n'était jamais persisté ; il enrichissait les
-- écritures du GL général (matching date+montant) et les lignes orphelines
-- atterrissaient dans fna_tiers_unmatched. Quand le matching échouait
-- (no_candidate), la balance auxiliaire restait vide.
--
-- Maintenant : chaque ligne du GL Tiers importée est persistée ici, avec sa
-- catégorie SYSCOHADA (client/fournisseur/personnel/etat/autres). La balance
-- auxiliaire se calcule directement à partir de ce livre (groupée par compte
-- collectif + code tiers) — elle fonctionne TOUJOURS, centralisé ou non.
-- Le rapprochement Σ(auxiliaire par collectif) = solde GL collectif reste un
-- contrôle de cohérence, plus un prérequis.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fna_gl_tiers (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  import_id    bigint REFERENCES fna_imports(id) ON DELETE CASCADE,
  period_id    text,                              -- journalisation : période rattachée

  date         date NOT NULL,
  account      text NOT NULL,                     -- compte collectif (411100…)
  code_tiers   text NOT NULL,                     -- code tiers individuel (CLI001…)
  label_tiers  text DEFAULT '',
  label        text DEFAULT '',
  debit        numeric(18,2) NOT NULL DEFAULT 0,
  credit       numeric(18,2) NOT NULL DEFAULT 0,
  journal      text DEFAULT '',
  piece        text DEFAULT '',

  category     text NOT NULL CHECK (category IN (
    'client', 'fournisseur', 'personnel', 'etat', 'autres'
  )),

  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gl_tiers_org_cat
  ON fna_gl_tiers(org_id, category);
CREATE INDEX IF NOT EXISTS idx_gl_tiers_org_account
  ON fna_gl_tiers(org_id, account);
CREATE INDEX IF NOT EXISTS idx_gl_tiers_import
  ON fna_gl_tiers(import_id);

-- RLS : alignée sur les policies fna_tiers_unmatched / fna_gl_entries
ALTER TABLE fna_gl_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fna_gl_tiers_select ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_select ON fna_gl_tiers FOR SELECT
  USING (org_id IN (SELECT fna_auth_org_ids()));

DROP POLICY IF EXISTS fna_gl_tiers_insert ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_insert ON fna_gl_tiers FOR INSERT
  WITH CHECK (org_id IN (SELECT fna_auth_org_ids('editor')));

DROP POLICY IF EXISTS fna_gl_tiers_update ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_update ON fna_gl_tiers FOR UPDATE
  USING (org_id IN (SELECT fna_auth_org_ids('editor')));

DROP POLICY IF EXISTS fna_gl_tiers_delete ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_delete ON fna_gl_tiers FOR DELETE
  USING (org_id IN (SELECT fna_auth_org_ids('editor')));

-- Policies RESTRICTIVE : double check via can_write_for_fna() / fallback
DROP POLICY IF EXISTS fna_gl_tiers_role_write ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_role_write ON fna_gl_tiers AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_gl_tiers_role_update ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_role_update ON fna_gl_tiers AS RESTRICTIVE
  FOR UPDATE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_gl_tiers_role_delete ON fna_gl_tiers;
CREATE POLICY fna_gl_tiers_role_delete ON fna_gl_tiers AS RESTRICTIVE
  FOR DELETE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );
