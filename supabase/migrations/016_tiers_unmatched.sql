-- ════════════════════════════════════════════════════════════════════
-- 016_tiers_unmatched.sql
--
-- Table persistante pour les lignes de GL Tiers qui n'ont pas trouvé
-- de correspondance dans le Grand Livre lors de l'import.
--
-- Principe métier : le GL Tiers ne crée jamais d'écritures dans
-- fna_gl_entries. Il enrichit uniquement les écritures existantes
-- avec le code tiers. Les lignes sans correspondance étaient avant
-- silencieusement créées en "standalone" (duplication des comptes
-- parents), puis simplement comptées (perte d'info).
--
-- Maintenant : chaque ligne non rapprochée est persistée avec son
-- contexte complet + le motif (no_candidate / tiers_conflict /
-- ambiguous). Le comptable peut les réviser manuellement, les
-- supprimer, ou ré-affecter à une écriture GL.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fna_tiers_unmatched (
  id            bigserial PRIMARY KEY,
  org_id        text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  import_id     bigint REFERENCES fna_imports(id) ON DELETE CASCADE,

  -- Ligne source du fichier tiers
  row_index     int NOT NULL,         -- n° de ligne dans le fichier
  date          date NOT NULL,
  account       text NOT NULL,
  code_tiers    text NOT NULL,
  label_tiers   text DEFAULT '',
  debit         numeric(18,2) NOT NULL DEFAULT 0,
  credit        numeric(18,2) NOT NULL DEFAULT 0,
  journal       text DEFAULT '',
  piece         text DEFAULT '',
  label         text DEFAULT '',

  -- Motif du non-rapprochement
  reason        text NOT NULL CHECK (reason IN (
    'no_candidate',      -- aucune écriture GL ne correspond
    'tiers_conflict',    -- l'écriture GL a déjà un tiers différent
    'ambiguous'          -- plusieurs candidats équivalents (à arbitrer)
  )),
  candidate_ids bigint[],              -- IDs GL candidats si ambiguous

  -- Résolution manuelle (NULL = en attente de revue)
  resolved_at   timestamptz,
  resolved_by   uuid,                  -- auth.uid() de l'utilisateur
  resolved_to   bigint REFERENCES fna_gl_entries(id) ON DELETE SET NULL,
  resolution    text CHECK (resolution IN ('matched', 'dismissed', 'manual_create')),

  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_tiers_unmatched_org_pending
  ON fna_tiers_unmatched(org_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_tiers_unmatched_import
  ON fna_tiers_unmatched(import_id);

-- RLS : alignée sur les policies fna_gl_entries
ALTER TABLE fna_tiers_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fna_tiers_unmatched_select ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_select ON fna_tiers_unmatched FOR SELECT
  USING (org_id IN (SELECT fna_auth_org_ids()));

DROP POLICY IF EXISTS fna_tiers_unmatched_insert ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_insert ON fna_tiers_unmatched FOR INSERT
  WITH CHECK (org_id IN (SELECT fna_auth_org_ids('editor')));

DROP POLICY IF EXISTS fna_tiers_unmatched_update ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_update ON fna_tiers_unmatched FOR UPDATE
  USING (org_id IN (SELECT fna_auth_org_ids('editor')));

DROP POLICY IF EXISTS fna_tiers_unmatched_delete ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_delete ON fna_tiers_unmatched FOR DELETE
  USING (org_id IN (SELECT fna_auth_org_ids('editor')));

-- Policies RESTRICTIVE : double check via can_write_for_fna() / fallback
DROP POLICY IF EXISTS fna_tiers_unmatched_role_write ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_role_write ON fna_tiers_unmatched AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_tiers_unmatched_role_update ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_role_update ON fna_tiers_unmatched AS RESTRICTIVE
  FOR UPDATE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );

DROP POLICY IF EXISTS fna_tiers_unmatched_role_delete ON fna_tiers_unmatched;
CREATE POLICY fna_tiers_unmatched_role_delete ON fna_tiers_unmatched AS RESTRICTIVE
  FOR DELETE
  USING (
    can_write_for_fna()
    OR auth.role() = 'service_role'
    OR org_id IN (SELECT fna_auth_org_ids('editor'))
  );
