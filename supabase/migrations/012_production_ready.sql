-- ════════════════════════════════════════════════════════════════════
-- 012_production_ready.sql
--
-- Synchronisation backend ↔ frontend pour la mise en production.
-- Cette migration consolide TOUS les écarts identifiés lors de l'audit
-- production-readiness :
--
--   1. Renommage des tables avec préfixe `fna_*` (frontend-aligned)
--   2. Création des tables manquantes :
--      - fna_org_members (annuaire users multi-device)
--      - fna_activities  (annotations / commentaires / corrections)
--      - fna_channels + fna_chat_messages (chat interne)
--   3. Colonnes WBS sémantiques sur codes & assignments analytiques
--   4. Étendre fna_imports.kind avec ANALYTIC_AXES / ANALYTIC_CODES
--   5. Mettre à jour la publication realtime
--
-- À exécuter UNE SEULE FOIS sur le projet Supabase de prod.
-- ════════════════════════════════════════════════════════════════════

-- ── 1) Renommage `*` → `fna_*` (idempotent via IF EXISTS) ──────────
ALTER TABLE IF EXISTS organizations            RENAME TO fna_organizations;
ALTER TABLE IF EXISTS user_orgs                RENAME TO fna_user_orgs;
ALTER TABLE IF EXISTS fiscal_years             RENAME TO fna_fiscal_years;
ALTER TABLE IF EXISTS periods                  RENAME TO fna_periods;
ALTER TABLE IF EXISTS accounts                 RENAME TO fna_accounts;
ALTER TABLE IF EXISTS account_mappings         RENAME TO fna_account_mappings;
ALTER TABLE IF EXISTS gl_entries               RENAME TO fna_gl_entries;
ALTER TABLE IF EXISTS imports                  RENAME TO fna_imports;
ALTER TABLE IF EXISTS budgets                  RENAME TO fna_budgets;
ALTER TABLE IF EXISTS reports                  RENAME TO fna_reports;
ALTER TABLE IF EXISTS report_templates         RENAME TO fna_report_templates;
ALTER TABLE IF EXISTS attention_points         RENAME TO fna_attention_points;
ALTER TABLE IF EXISTS action_plans             RENAME TO fna_action_plans;
ALTER TABLE IF EXISTS analytic_axes            RENAME TO fna_analytic_axes;
ALTER TABLE IF EXISTS analytic_codes           RENAME TO fna_analytic_codes;
ALTER TABLE IF EXISTS analytic_rules           RENAME TO fna_analytic_rules;
ALTER TABLE IF EXISTS analytic_assignments     RENAME TO fna_analytic_assignments;
ALTER TABLE IF EXISTS analytic_budgets         RENAME TO fna_analytic_budgets;
ALTER TABLE IF EXISTS email_logs               RENAME TO fna_email_logs;
ALTER TABLE IF EXISTS email_schedules          RENAME TO fna_email_schedules;
ALTER TABLE IF EXISTS period_audit_log         RENAME TO fna_period_audit_log;

-- ── 2) Branche WBS sur codes + assignments analytiques ──────────────
ALTER TABLE fna_analytic_codes
  ADD COLUMN IF NOT EXISTS branch text
  CHECK (branch IN ('revenue', 'project_cost', 'overhead'));
CREATE INDEX IF NOT EXISTS idx_fna_analytic_codes_branch
  ON fna_analytic_codes(org_id, branch);

ALTER TABLE fna_analytic_assignments
  ADD COLUMN IF NOT EXISTS branch text
  CHECK (branch IN ('revenue', 'project_cost', 'overhead'));
CREATE INDEX IF NOT EXISTS idx_fna_analytic_assign_branch
  ON fna_analytic_assignments(org_id, branch);

-- ── 3) fna_imports.kind étendu avec ANALYTIC_AXES / ANALYTIC_CODES ──
ALTER TABLE fna_imports DROP CONSTRAINT IF EXISTS imports_kind_check;
ALTER TABLE fna_imports DROP CONSTRAINT IF EXISTS fna_imports_kind_check;
ALTER TABLE fna_imports
  ADD CONSTRAINT fna_imports_kind_check
  CHECK (kind IN ('GL','BUDGET','COA','BALANCE','TIERS','IMMO','ANALYTIC_AXES','ANALYTIC_CODES'));

-- ── 4) Tables manquantes : fna_org_members ──────────────────────────
CREATE TABLE IF NOT EXISTS fna_org_members (
  id            bigserial PRIMARY KEY,
  org_id        text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  email         text NOT NULL,
  name          text,
  role          text NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin','editor','viewer','accountant_admin')),
  active        boolean NOT NULL DEFAULT true,
  invited_at    bigint NOT NULL DEFAULT (extract(epoch from now())*1000)::bigint,
  last_login_at bigint,
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_fna_org_members_org ON fna_org_members(org_id);
ALTER TABLE fna_org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see their org members" ON fna_org_members;
CREATE POLICY "Users see their org members" ON fna_org_members FOR SELECT
  USING (org_id IN (SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage org members" ON fna_org_members;
CREATE POLICY "Admins manage org members" ON fna_org_members FOR ALL
  USING (org_id IN (
    SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ── 5) fna_activities (annotations / corrections / validations) ────
CREATE TABLE IF NOT EXISTS fna_activities (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('annotation','comment','correction','validation')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','archived')),
  context      text NOT NULL,
  linked_id    text,
  author_id    text,
  author_name  text,
  author_role  text,
  content      text NOT NULL,
  metadata     jsonb,
  created_at   bigint NOT NULL,
  updated_at   bigint,
  resolved_at  bigint,
  resolved_by  text
);
CREATE INDEX IF NOT EXISTS idx_fna_activities_org_created ON fna_activities(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fna_activities_kind        ON fna_activities(org_id, kind);
CREATE INDEX IF NOT EXISTS idx_fna_activities_linked      ON fna_activities(linked_id);
ALTER TABLE fna_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see activities" ON fna_activities;
CREATE POLICY "Users see activities" ON fna_activities FOR SELECT
  USING (org_id IN (SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Editors manage activities" ON fna_activities;
CREATE POLICY "Editors manage activities" ON fna_activities FOR ALL
  USING (org_id IN (
    SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid() AND role IN ('admin','editor')
  ));

-- ── 6) fna_channels + fna_chat_messages (chat interne) ──────────────
CREATE TABLE IF NOT EXISTS fna_channels (
  id           text PRIMARY KEY,
  org_id       text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('public','private','dm')),
  name         text NOT NULL,
  description  text,
  members      text[],
  created_by   text NOT NULL,
  created_at   bigint NOT NULL,
  updated_at   bigint,
  is_pinned    boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_fna_channels_org ON fna_channels(org_id);
ALTER TABLE fna_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see channels" ON fna_channels;
CREATE POLICY "Users see channels" ON fna_channels FOR SELECT
  USING (org_id IN (SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Members manage channels" ON fna_channels;
CREATE POLICY "Members manage channels" ON fna_channels FOR ALL
  USING (org_id IN (SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS fna_chat_messages (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL REFERENCES fna_organizations(id) ON DELETE CASCADE,
  channel_id   text NOT NULL REFERENCES fna_channels(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  user_name    text NOT NULL,
  content      text NOT NULL,
  mentions     text[],
  reactions    jsonb,
  reply_to     bigint,
  attachment   jsonb,
  created_at   bigint NOT NULL,
  edited_at    bigint,
  read_by      text[]
);
CREATE INDEX IF NOT EXISTS idx_fna_chat_msg_channel ON fna_chat_messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fna_chat_msg_org     ON fna_chat_messages(org_id);
ALTER TABLE fna_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see messages of their orgs" ON fna_chat_messages;
CREATE POLICY "Users see messages of their orgs" ON fna_chat_messages FOR SELECT
  USING (org_id IN (SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users post messages in their orgs" ON fna_chat_messages;
CREATE POLICY "Users post messages in their orgs" ON fna_chat_messages FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM fna_user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users edit own messages" ON fna_chat_messages;
CREATE POLICY "Users edit own messages" ON fna_chat_messages FOR UPDATE
  USING (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own messages" ON fna_chat_messages;
CREATE POLICY "Users delete own messages" ON fna_chat_messages FOR DELETE
  USING (user_id = auth.uid()::text);

-- ── 7) Realtime publication mise à jour ─────────────────────────────
DO $$
BEGIN
  -- Drop old (sans préfixe) si existent
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'attention_points') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE attention_points;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'action_plans') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE action_plans;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reports') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE reports;
  END IF;

  -- Add new (préfixe fna_*)
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fna_attention_points') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fna_attention_points;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fna_action_plans') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fna_action_plans;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fna_reports') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fna_reports;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fna_user_orgs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fna_user_orgs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fna_chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fna_chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'fna_activities') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fna_activities;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════
-- FIN — vérifier `\d fna_*` dans psql après exécution.
-- ════════════════════════════════════════════════════════════════════
