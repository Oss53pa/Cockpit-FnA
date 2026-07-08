-- ═══════════════════════════════════════════════════════════════════════════
-- 029 — Espace Collaboratif : snapshots figés & hashés (§9 du CDC)
-- ---------------------------------------------------------------------------
-- Un snapshot gèle des données structurées (jsonb) + un hash SHA-256, immuable.
-- Comme fna_space_events : APPEND-ONLY (aucun UPDATE/DELETE) — c'est ce qui fonde
-- la valeur de piste d'audit / preuve opposable. org_id + RLS (fna_auth_org_ids).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fna_space_snapshots (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL,
  space_id     text NOT NULL REFERENCES fna_spaces(id) ON DELETE CASCADE,
  source_app   text NOT NULL DEFAULT 'fna',            -- 'fna' | 'cashpilot' | ...
  source_view  text NOT NULL,                          -- 'bilan' | 'ratios' | 'space_resolution' | ...
  label        text NOT NULL,
  filters      jsonb NOT NULL DEFAULT '{}',
  data         jsonb NOT NULL,                          -- { columns, rows, aggregates, context }
  hash_sha256  text NOT NULL,
  taken_by     text NOT NULL,
  taken_at     bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fna_space_snapshots_space ON fna_space_snapshots(space_id, taken_at);

-- Append-only : un snapshot ne se modifie ni ne se supprime (immuable).
CREATE OR REPLACE FUNCTION fna_space_snapshots_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fna_space_snapshots est append-only : un snapshot est immuable';
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fna_space_snapshots_no_update ON fna_space_snapshots;
CREATE TRIGGER trg_fna_space_snapshots_no_update
  BEFORE UPDATE OR DELETE ON fna_space_snapshots
  FOR EACH ROW EXECUTE FUNCTION fna_space_snapshots_block_mutation();

REVOKE UPDATE, DELETE ON fna_space_snapshots FROM anon, authenticated;

-- ── RLS : lecture par membres de l'org, insertion par éditeurs ─────────────
ALTER TABLE fna_space_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fna_space_snapshots_select ON fna_space_snapshots;
CREATE POLICY fna_space_snapshots_select ON fna_space_snapshots
  FOR SELECT USING (org_id IN (SELECT fna_auth_org_ids()));

DROP POLICY IF EXISTS fna_space_snapshots_insert ON fna_space_snapshots;
CREATE POLICY fna_space_snapshots_insert ON fna_space_snapshots
  FOR INSERT WITH CHECK (org_id IN (SELECT fna_auth_org_ids('editor')));
-- Pas de policy UPDATE/DELETE : append-only (le trigger bloque en plus).
