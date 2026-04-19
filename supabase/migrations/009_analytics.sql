-- Analytic axes
create table if not exists analytic_axes (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  number int not null check (number between 1 and 5),
  name text not null,
  code_name text not null default '',
  required boolean not null default false,
  active boolean not null default true,
  unique (org_id, number)
);

-- Analytic codes
create table if not exists analytic_codes (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  axis_id text not null references analytic_axes(id) on delete cascade,
  code text not null,
  short_label text not null default '',
  long_label text not null default '',
  parent_id text,
  active boolean not null default true,
  "order" int not null default 0
);

create index idx_analytic_codes_org_axis on analytic_codes(org_id, axis_id);

-- Analytic rules
create table if not exists analytic_rules (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  name text not null,
  priority int not null default 0,
  active boolean not null default true,
  condition_type text not null,
  condition_value text not null,
  target_axis int not null,
  analytic_code_id text not null references analytic_codes(id) on delete cascade,
  created_at bigint not null
);

-- Analytic assignments
create table if not exists analytic_assignments (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  gl_entry_id bigint not null references gl_entries(id) on delete cascade,
  axis_number int not null,
  code_id text not null references analytic_codes(id) on delete cascade,
  method text not null default 'direct',
  rule_id text,
  assigned_at bigint not null
);

create index idx_analytic_assign_org_gl on analytic_assignments(org_id, gl_entry_id);

-- Analytic budgets
create table if not exists analytic_budgets (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  code_id text not null references analytic_codes(id) on delete cascade,
  period text not null,
  amount numeric(18,2) not null default 0
);

-- RLS for all analytic tables
alter table analytic_axes enable row level security;
alter table analytic_codes enable row level security;
alter table analytic_rules enable row level security;
alter table analytic_assignments enable row level security;
alter table analytic_budgets enable row level security;

create policy "Users see analytic_axes" on analytic_axes for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage analytic_axes" on analytic_axes for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see analytic_codes" on analytic_codes for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage analytic_codes" on analytic_codes for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see analytic_rules" on analytic_rules for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage analytic_rules" on analytic_rules for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see analytic_assignments" on analytic_assignments for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage analytic_assignments" on analytic_assignments for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see analytic_budgets" on analytic_budgets for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage analytic_budgets" on analytic_budgets for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
