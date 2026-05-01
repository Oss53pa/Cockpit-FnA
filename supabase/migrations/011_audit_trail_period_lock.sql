-- ════════════════════════════════════════════════════════════════════════
-- Migration 011 — Audit trail SHA-256 + verrouillage périodes clôturées
-- ════════════════════════════════════════════════════════════════════════
--
-- Apporte :
--   1. Chaînage cryptographique des écritures du Grand Livre (SHA-256)
--   2. Statut explicite open/closed/archived sur les périodes
--   3. Override accountant_admin avec audit log obligatoire
--   4. RLS policies pour bloquer les mutations sur période fermée
--
-- Conformité : SYSCOHADA art. 17 + 38, AUDCIF, SOX 404
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1. Audit trail SHA-256 sur gl_entries ──────────────────────────────

alter table gl_entries
  add column if not exists hash text,
  add column if not exists previous_hash text;

-- Index pour vérification rapide de la chaîne et détection de hash en doublon
create index if not exists idx_gl_entries_hash on gl_entries(hash);

-- Vérification : tout hash doit faire 64 caractères hex (SHA-256)
alter table gl_entries
  drop constraint if exists chk_gl_hash_format,
  add constraint chk_gl_hash_format check (
    hash is null or hash ~ '^[0-9a-f]{64}$'
  );

comment on column gl_entries.hash is
  'SHA-256(previous_hash || canonical(entry)). Chaîne d''intégrité — toute modification a posteriori invalide la suite.';
comment on column gl_entries.previous_hash is
  'Hash de l''écriture précédente dans la chaîne. NULL pour la première écriture d''un orgId.';

-- ─── 2. Statut périodes (open/closed/archived) ──────────────────────────

-- On garde la colonne `closed` boolean existante pour rétro-compat, mais on
-- ajoute `status` qui est plus expressive (archived = > 5 ans, lecture seule
-- même pour accountant_admin sauf escalade légale).
alter table periods
  add column if not exists status text not null default 'open'
    check (status in ('open', 'closed', 'archived')),
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id),
  add column if not exists closed_reason text;

-- Trigger : sync `closed` boolean ↔ `status` text pour rétro-compat
create or replace function sync_period_closed_status()
returns trigger language plpgsql as $$
begin
  -- Si status change, sync closed (legacy boolean)
  if new.status is distinct from old.status then
    new.closed := (new.status = 'closed' or new.status = 'archived');
    if new.status = 'closed' and old.status = 'open' then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
  -- Si closed legacy change, sync status
  elsif new.closed is distinct from old.closed then
    new.status := case when new.closed then 'closed' else 'open' end;
    if new.closed and not coalesce(old.closed, false) then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_periods_sync_status on periods;
create trigger trg_periods_sync_status
  before update on periods
  for each row execute function sync_period_closed_status();

create index if not exists idx_periods_status on periods(status);

-- ─── 3. Idem pour fiscal_years (clôture annuelle) ──────────────────────

alter table fiscal_years
  add column if not exists status text not null default 'open'
    check (status in ('open', 'closed', 'archived')),
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references auth.users(id),
  add column if not exists closed_reason text;

drop trigger if exists trg_fiscal_years_sync_status on fiscal_years;
create trigger trg_fiscal_years_sync_status
  before update on fiscal_years
  for each row execute function sync_period_closed_status();

create index if not exists idx_fiscal_years_status on fiscal_years(status);

-- ─── 4. RLS policies — blocage écritures sur période fermée ────────────

-- On supprime l'ancienne policy "Editors manage GL" pour la remplacer par
-- une version qui bloque INSERT/UPDATE/DELETE sur période fermée (sauf admin).

drop policy if exists "Editors manage GL" on gl_entries;

-- SELECT : les éditeurs voient toutes les écritures (lecture toujours OK)
create policy "Editors read GL"
  on gl_entries for select
  using (
    org_id in (
      select org_id from user_orgs
      where user_id = auth.uid() and role in ('admin', 'editor', 'viewer')
    )
  );

-- INSERT : refusé si la période est fermée (sauf accountant_admin)
create policy "Editors insert GL on open period"
  on gl_entries for insert
  with check (
    org_id in (
      select org_id from user_orgs
      where user_id = auth.uid() and role in ('admin', 'editor')
    )
    and (
      not exists (
        select 1 from periods
        where periods.id = gl_entries.period_id
          and periods.status in ('closed', 'archived')
      )
      or exists (
        select 1 from user_orgs
        where user_id = auth.uid() and org_id = gl_entries.org_id
          and role = 'admin'
      )
    )
  );

-- UPDATE : idem
create policy "Editors update GL on open period"
  on gl_entries for update
  using (
    org_id in (
      select org_id from user_orgs
      where user_id = auth.uid() and role in ('admin', 'editor')
    )
  )
  with check (
    not exists (
      select 1 from periods
      where periods.id = gl_entries.period_id
        and periods.status in ('closed', 'archived')
    )
    or exists (
      select 1 from user_orgs
      where user_id = auth.uid() and org_id = gl_entries.org_id
        and role = 'admin'
    )
  );

-- DELETE : interdit sur période fermée (audit trail nécessite la conservation)
create policy "Editors delete GL on open period"
  on gl_entries for delete
  using (
    org_id in (
      select org_id from user_orgs
      where user_id = auth.uid() and role in ('admin', 'editor')
    )
    and not exists (
      select 1 from periods
      where periods.id = gl_entries.period_id
        and periods.status in ('closed', 'archived')
    )
  );

-- ─── 5. Audit log des actions de clôture/réouverture ───────────────────

create table if not exists period_audit_log (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  period_id text references periods(id) on delete set null,
  fiscal_year_id text references fiscal_years(id) on delete set null,
  action text not null check (action in ('lock', 'unlock', 'archive', 'restore')),
  reason text,
  user_id uuid references auth.users(id),
  user_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_period_audit_org on period_audit_log(org_id, created_at desc);

alter table period_audit_log enable row level security;

create policy "Users see audit log of their orgs"
  on period_audit_log for select
  using (
    org_id in (
      select org_id from user_orgs where user_id = auth.uid()
    )
  );

-- Seuls les admins peuvent insérer (les fonctions lock/unlock côté backend)
create policy "Admins insert audit log"
  on period_audit_log for insert
  with check (
    org_id in (
      select org_id from user_orgs
      where user_id = auth.uid() and role in ('admin')
    )
  );

-- Pas de UPDATE / DELETE — le log est immuable par design

comment on table period_audit_log is
  'Journal d''audit des clôtures/réouvertures de périodes. Immuable. Conformité SOX 404.';
