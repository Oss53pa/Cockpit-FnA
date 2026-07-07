-- ═══════════════════════════════════════════════════════════════════════════
-- 028 — ESPACE COLLABORATIF : résolution de problèmes ancrée au grand livre
-- « Slack fait parler les gens ; l'Espace Collaboratif fait converger un
--   problème vers zéro. »
-- 6 tables préfixées fna_space* · org_id + RLS (fna_auth_org_ids) ·
-- fil d'événements APPEND-ONLY (privilèges + trigger).
-- Montants : bigint XOF. Convergence : points de base int (0-10000), calculée.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. fna_spaces — l'espace de résolution ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fna_spaces (
  id                text PRIMARY KEY,
  org_id            text NOT NULL,
  title             text NOT NULL,
  status            text NOT NULL DEFAULT 'ouvert'
                    CHECK (status IN ('ouvert','analyse','action','resolu','archive','abandonne')),
  problem_statement text NOT NULL,
  problem_impact    text,
  anchor_type       text NOT NULL
                    CHECK (anchor_type IN ('account_period','reconciliation','partner','journal_entry','closing_period','budget_line')),
  anchor_ref        text NOT NULL,
  anchor_label      text,
  initial_gap_xof   bigint,
  owner_id          text NOT NULL,
  owner_name        text,
  members           jsonb,
  due_date          date,
  convergence_bp    int  NOT NULL DEFAULT 0 CHECK (convergence_bp BETWEEN 0 AND 10000),
  abandon_reason    text,
  resolved_at       bigint,
  archived_at       bigint,
  created_at        bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fna_spaces_org ON fna_spaces(org_id, status);

-- ── 2. fna_space_criteria — critères de sortie ─────────────────────────────
CREATE TABLE IF NOT EXISTS fna_space_criteria (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL,
  space_id     text NOT NULL REFERENCES fna_spaces(id) ON DELETE CASCADE,
  label        text NOT NULL,
  kind         text NOT NULL DEFAULT 'manual_check' CHECK (kind IN ('computed','manual_check')),
  compute_ref  text,
  satisfied    boolean NOT NULL DEFAULT false,
  satisfied_by text,
  satisfied_at bigint,
  created_at   bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fna_space_criteria_space ON fna_space_criteria(space_id);

-- ── 3. fna_space_solutions — solutions proposées / retenues / écartées ─────
CREATE TABLE IF NOT EXISTS fna_space_solutions (
  id            bigserial PRIMARY KEY,
  org_id        text NOT NULL,
  space_id      text NOT NULL REFERENCES fna_spaces(id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text,
  proposed_by   text NOT NULL,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','kept','discarded')),
  status_reason text,   -- motif OBLIGATOIRE côté applicatif quand status='discarded'
  decided_by    text,
  created_at    bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fna_space_solutions_space ON fna_space_solutions(space_id);

-- ── 4. fna_space_actions — checklist de résolution minimaliste ─────────────
CREATE TABLE IF NOT EXISTS fna_space_actions (
  id               bigserial PRIMARY KEY,
  org_id           text NOT NULL,
  space_id         text NOT NULL REFERENCES fna_spaces(id) ON DELETE CASCADE,
  label            text NOT NULL,
  assignee         text,
  due_date         date,
  is_critical_path boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  completed_at     bigint,
  completed_by     text,
  created_at       bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fna_space_actions_space ON fna_space_actions(space_id);
CREATE INDEX IF NOT EXISTS idx_fna_space_actions_assignee ON fna_space_actions(org_id, assignee, status);

-- ── 5. fna_space_events — fil unifié APPEND-ONLY ───────────────────────────
CREATE TABLE IF NOT EXISTS fna_space_events (
  id             bigserial PRIMARY KEY,
  org_id         text NOT NULL,
  space_id       text NOT NULL REFERENCES fna_spaces(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  actor          text NOT NULL,
  actor_kind     text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user','system','proph3t')),
  origin_surface text NOT NULL DEFAULT 'space' CHECK (origin_surface IN ('space','fna_workspace')),
  payload        jsonb NOT NULL DEFAULT '{}',
  created_at     bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fna_space_events_space ON fna_space_events(space_id, created_at);

-- Append-only : aucun UPDATE/DELETE, même pour un rôle applicatif.
CREATE OR REPLACE FUNCTION fna_space_events_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'fna_space_events est append-only : une correction est un nouvel événement';
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fna_space_events_no_update ON fna_space_events;
CREATE TRIGGER trg_fna_space_events_no_update
  BEFORE UPDATE OR DELETE ON fna_space_events
  FOR EACH ROW EXECUTE FUNCTION fna_space_events_block_mutation();

REVOKE UPDATE, DELETE ON fna_space_events FROM anon, authenticated;

-- ── 6. fna_space_decisions — gouvernance par seuils ────────────────────────
CREATE TABLE IF NOT EXISTS fna_space_decisions (
  id             bigserial PRIMARY KEY,
  org_id         text NOT NULL,
  space_id       text NOT NULL REFERENCES fna_spaces(id) ON DELETE CASCADE,
  ref            text NOT NULL,                       -- DEC-AAAA-NNN
  decision_type  text NOT NULL,
  title          text NOT NULL,
  body           text,
  amount_xof     bigint,
  status         text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  required_roles jsonb NOT NULL DEFAULT '[]',
  approved_by    jsonb,
  rejected_by    text,
  reject_reason  text,
  created_at     bigint NOT NULL,
  UNIQUE (org_id, ref)
);
CREATE INDEX IF NOT EXISTS idx_fna_space_decisions_space ON fna_space_decisions(space_id);

-- ── RLS : membres de l'org (lecture), éditeurs (écriture) ──────────────────
ALTER TABLE fna_spaces          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fna_space_criteria  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fna_space_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fna_space_actions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fna_space_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fna_space_decisions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fna_spaces','fna_space_criteria','fna_space_solutions','fna_space_actions','fna_space_events','fna_space_decisions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (org_id IN (SELECT fna_auth_org_ids()))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (org_id IN (SELECT fna_auth_org_ids(''editor'')))', t, t);
    -- UPDATE/DELETE : pas sur les événements (append-only) — le trigger bloque de
    -- toute façon, mais on n'ouvre même pas la policy.
    IF t <> 'fna_space_events' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
      EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE USING (org_id IN (SELECT fna_auth_org_ids(''editor'')))', t, t);
      EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);
      EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE USING (org_id IN (SELECT fna_auth_org_ids(''editor'')))', t, t);
    END IF;
  END LOOP;
END $$;
