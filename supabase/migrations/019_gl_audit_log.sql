-- ════════════════════════════════════════════════════════════════════
-- 019_gl_audit_log.sql
--
-- Table d'audit des modifications a posteriori sur les écritures GL.
--
-- Contexte : les écritures GL ont une chaîne de hash SHA-256 calculée à
-- l'insertion (cf. lib/auditHash.ts). Cette chaîne prouve qu'AUCUNE écriture
-- n'a été modifiée depuis son insertion d'origine.
--
-- Problème : l'import GL Tiers UPDATE certains champs (tiers, label) sur des
-- écritures déjà inserées. Cela CASSE la chaîne de hash d'origine — pas un
-- vrai problème d'intégrité (modification légitime documentée), mais on perd
-- la traçabilité de qui/quand/quoi.
--
-- Solution : un audit log séparé. La chaîne SHA-256 d'origine reste intacte
-- (référence "état initial après import"), et chaque modification ultérieure
-- est tracée dans fna_gl_audit_log avec sa propre chaîne de hash.
--
-- Structure : un row par changement de champ. Hash chaîné par org pour
-- détecter toute insertion/suppression a posteriori dans le log lui-même.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fna_gl_audit_log (
  id            bigserial PRIMARY KEY,
  org_id        text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  gl_entry_id   bigint NOT NULL REFERENCES fna_gl_entries(id) ON DELETE CASCADE,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    uuid,                              -- auth.uid()
  field         text NOT NULL,                     -- 'tiers' | 'label' | ...
  old_value     text,
  new_value     text,
  reason        text NOT NULL,                     -- 'tiers_import' | 'manual_match' | ...
  -- Source de l'opération (import_id si applicable)
  source_kind   text,                              -- 'TIERS' | 'MANUAL'
  source_id     bigint,                            -- fna_imports.id si TIERS
  -- Chaîne de hash SHA-256 par org
  audit_hash         text NOT NULL,
  previous_audit_hash text NOT NULL DEFAULT ''
);

CREATE INDEX idx_gl_audit_org_time
  ON fna_gl_audit_log(org_id, changed_at DESC);
CREATE INDEX idx_gl_audit_entry
  ON fna_gl_audit_log(gl_entry_id);
CREATE INDEX idx_gl_audit_source
  ON fna_gl_audit_log(source_kind, source_id);

-- RLS : lecture pour tous les utilisateurs de l'org, écriture restreinte
-- aux editor/admin.
ALTER TABLE fna_gl_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fna_gl_audit_log_select ON fna_gl_audit_log;
CREATE POLICY fna_gl_audit_log_select ON fna_gl_audit_log FOR SELECT
  USING (org_id IN (SELECT fna_auth_org_ids()));

DROP POLICY IF EXISTS fna_gl_audit_log_insert ON fna_gl_audit_log;
CREATE POLICY fna_gl_audit_log_insert ON fna_gl_audit_log FOR INSERT
  WITH CHECK (org_id IN (SELECT fna_auth_org_ids('editor')));

-- Pas de UPDATE/DELETE policies → le log est append-only (immuable).
-- Toute tentative de modification rejetée par RLS.

-- Helper SQL : récupérer le dernier audit_hash pour une org (utile en client
-- pour calculer la nouvelle valeur de previous_audit_hash sans race condition
-- locale, mais une vraie atomicité demanderait une RPC SECURITY DEFINER).
CREATE OR REPLACE FUNCTION fna_get_last_audit_hash(p_org_id text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(audit_hash, '') FROM fna_gl_audit_log
  WHERE org_id = p_org_id
  ORDER BY id DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION fna_get_last_audit_hash TO authenticated;
