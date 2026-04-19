-- Reports
create table if not exists reports (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  title text not null,
  type text not null default '',
  author text not null default '',
  status text not null default 'draft' check (status in ('draft','review','approved','diffused')),
  created_at bigint not null default extract(epoch from now())::bigint * 1000,
  updated_at bigint not null default extract(epoch from now())::bigint * 1000,
  content text
);

-- Report templates
create table if not exists report_templates (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  config text not null default '{}',
  created_at bigint not null default extract(epoch from now())::bigint * 1000,
  updated_at bigint not null default extract(epoch from now())::bigint * 1000
);

-- RLS
alter table reports enable row level security;
alter table report_templates enable row level security;

create policy "Users see reports" on reports for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage reports" on reports for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see templates" on report_templates for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage templates" on report_templates for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
