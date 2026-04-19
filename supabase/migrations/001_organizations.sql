-- Organizations
create table if not exists organizations (
  id text primary key,
  name text not null,
  currency text not null default 'XOF',
  sector text not null default '',
  accounting_system text not null default 'Normal',
  rccm text,
  ifu text,
  address text,
  created_at timestamptz not null default now()
);

-- User-org link with roles
create table if not exists user_orgs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id text not null references organizations(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  created_at timestamptz not null default now(),
  unique (user_id, org_id)
);

-- RLS
alter table organizations enable row level security;
alter table user_orgs enable row level security;

create policy "Users see their orgs"
  on organizations for select
  using (id in (select org_id from user_orgs where user_id = auth.uid()));

create policy "Admins can update org"
  on organizations for update
  using (id in (select org_id from user_orgs where user_id = auth.uid() and role = 'admin'));

create policy "Users see own memberships"
  on user_orgs for select
  using (user_id = auth.uid());

create policy "Admins manage memberships"
  on user_orgs for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role = 'admin'));
