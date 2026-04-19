-- Fiscal years
create table if not exists fiscal_years (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  year int not null,
  start_date date not null,
  end_date date not null,
  closed boolean not null default false
);

-- Periods
create table if not exists periods (
  id text primary key,
  org_id text not null references organizations(id) on delete cascade,
  fiscal_year_id text not null references fiscal_years(id) on delete cascade,
  year int not null,
  month int not null check (month between 1 and 13),
  label text not null,
  closed boolean not null default false
);

create index idx_periods_org_year on periods(org_id, year, month);

-- RLS
alter table fiscal_years enable row level security;
alter table periods enable row level security;

create policy "Users see fiscal years of their orgs"
  on fiscal_years for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));

create policy "Editors manage fiscal years"
  on fiscal_years for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see periods of their orgs"
  on periods for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));

create policy "Editors manage periods"
  on periods for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
