-- Import logs
create table if not exists imports (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  date bigint not null,
  user_name text not null default '',
  file_name text not null,
  file_hash text,
  source text not null default '',
  kind text not null check (kind in ('GL','BUDGET','COA','BALANCE','TIERS','IMMO')),
  year int,
  version text,
  count int not null default 0,
  rejected int not null default 0,
  status text not null default 'success' check (status in ('success','partial','error')),
  report text,
  storage_path text
);

create index idx_imports_org on imports(org_id, date desc);

-- RLS
alter table imports enable row level security;

create policy "Users see imports" on imports for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage imports" on imports for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

-- Storage bucket (run via Supabase dashboard or CLI)
-- insert into storage.buckets (id, name, public) values ('imports', 'imports', false);
