-- ════════════════════════════════════════════════════════════════════
-- 021_tiers_rules.sql
--
-- Règles de correction tiers MÉMORISÉES.
--
-- Problème : le rapprochement Balance auxiliaire ↔ Grand Livre fait
-- apparaître des écritures de classe 4 SANS code tiers (l'« écart »).
-- Le comptable peut les corriger manuellement (affecter un tiers) ou les
-- justifier (régularisation, OD interne…). Sans mémorisation, ces mêmes
-- corrections devraient être refaites à chaque ré-import du Grand Livre.
--
-- Cette table persiste la correction sous forme de RÈGLE réutilisable :
--   « compte (+ libellé contient) → action ».
--   • action 'assign' : poser le code tiers `tiers` sur les écritures sans
--     tiers correspondantes (réappliqué automatiquement après chaque import).
--   • action 'ignore' : considérer ces écritures comme justifiées → exclues
--     de l'écart du rapprochement (avec un motif).
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fna_tiers_rules (
  id             bigserial PRIMARY KEY,
  org_id         text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,

  account        text NOT NULL,            -- compte GL ciblé (match exact)
  label_contains text,                     -- optionnel : le libellé doit contenir ce motif (insensible casse)

  action         text NOT NULL CHECK (action IN ('assign', 'ignore')),
  tiers          text,                     -- action 'assign' : code tiers à poser
  tiers_label    text,                     -- action 'assign' : libellé tiers (optionnel)
  reason         text,                     -- justification (action 'ignore') ou note libre

  created_at     timestamptz DEFAULT now(),
  created_by     uuid                      -- auth.uid() de l'auteur
);

CREATE INDEX IF NOT EXISTS idx_tiers_rules_org ON fna_tiers_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_tiers_rules_org_account ON fna_tiers_rules(org_id, account);

-- RLS : alignée sur les policies fna_tiers_unmatched / fna_gl_entries
ALTER TABLE fna_tiers_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fna_tiers_rules_select ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_select ON fna_tiers_rules FOR SELECT
  USING (org_id IN (SELECT fna_auth_org_ids()));

DROP POLICY IF EXISTS fna_tiers_rules_insert ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_insert ON fna_tiers_rules FOR INSERT
  WITH CHECK (org_id IN (SELECT fna_auth_org_ids('editor')));

DROP POLICY IF EXISTS fna_tiers_rules_update ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_update ON fna_tiers_rules FOR UPDATE
  USING (org_id IN (SELECT fna_auth_org_ids('editor')));

DROP POLICY IF EXISTS fna_tiers_rules_delete ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_delete ON fna_tiers_rules FOR DELETE
  USING (org_id IN (SELECT fna_auth_org_ids('editor')));

-- Policies RESTRICTIVE : double check via can_write_for_fna() / fallback
DROP POLICY IF EXISTS fna_tiers_rules_role_write ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_role_write ON fna_tiers_rules AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_tiers_rules_role_update ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_role_update ON fna_tiers_rules AS RESTRICTIVE
  FOR UPDATE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_tiers_rules_role_delete ON fna_tiers_rules;
CREATE POLICY fna_tiers_rules_role_delete ON fna_tiers_rules AS RESTRICTIVE
  FOR DELETE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );
