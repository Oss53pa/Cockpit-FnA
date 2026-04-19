-- General Ledger entries
create table if not exists gl_entries (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  period_id text not null references periods(id) on delete cascade,
  date date not null,
  journal text not null,
  piece text not null default '',
  account text not null,
  label text not null default '',
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  tiers text,
  analytical_axis text,
  analytical_section text,
  lettrage text,
  import_id bigint
);

create index idx_gl_org_period on gl_entries(org_id, period_id);
create index idx_gl_org_account on gl_entries(org_id, account);
create index idx_gl_import on gl_entries(import_id);

-- RLS
alter table gl_entries enable row level security;

create policy "Users see GL" on gl_entries for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage GL" on gl_entries for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
