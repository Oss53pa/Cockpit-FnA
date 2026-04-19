-- Chart of accounts
create table if not exists accounts (
  org_id text not null references organizations(id) on delete cascade,
  code text not null,
  label text not null,
  sysco_code text,
  class text not null,
  type text not null check (type in ('A','P','C','R','X')),
  primary key (org_id, code)
);

create index idx_accounts_class on accounts(org_id, class);

-- Account mappings
create table if not exists account_mappings (
  org_id text not null references organizations(id) on delete cascade,
  source_code text not null,
  target_code text not null,
  primary key (org_id, source_code)
);

-- RLS
alter table accounts enable row level security;
alter table account_mappings enable row level security;

create policy "Users see accounts" on accounts for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage accounts" on accounts for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see mappings" on account_mappings for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage mappings" on account_mappings for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
