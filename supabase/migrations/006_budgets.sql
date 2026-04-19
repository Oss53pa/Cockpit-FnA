-- Budget lines
create table if not exists budgets (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  year int not null,
  version text not null default 'V1',
  account text not null,
  month int not null check (month between 1 and 12),
  amount numeric(18,2) not null default 0,
  analytical_axis text,
  analytical_section text
);

create index idx_budgets_org_year on budgets(org_id, year, version);

-- RLS
alter table budgets enable row level security;

create policy "Users see budgets" on budgets for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage budgets" on budgets for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
