-- ════════════════════════════════════════════════════════════════════
-- TEMPLATE RÉUTILISABLE — Invitation d'utilisateurs multi-tenant (Supabase)
--
-- Modèle :
--   • user_orgs   = appartenance AUTHORITATIVE (user_id ↔ org + rôle). C'est
--                   ce que lit la RLS. Écrite UNIQUEMENT par la service-role
--                   (Edge Function) ou par les RPC SECURITY DEFINER ci-dessous
--                   → pas d'auto-escalade de droits côté client.
--   • org_members = roster d'affichage indexé par email (permet de lister un
--                   invité AVANT qu'il ait accepté / ait un user_id).
--
-- Adaptez : renommez les tables (préfixe app_), ajoutez vos rôles, branchez
-- la policy générique (§5) sur CHACUNE de vos tables métier.
-- ════════════════════════════════════════════════════════════════════

-- ── 0) Organisations (si vous n'en avez pas déjà une) ───────────────
create table if not exists organizations (
  id          text primary key,
  name        text not null,
  created_at  timestamptz default now()
);

-- ── 1) Appartenance (source de vérité pour la RLS) ──────────────────
create table if not exists user_orgs (
  user_id   uuid not null references auth.users(id) on delete cascade,
  org_id    text not null references organizations(id) on delete cascade,
  role      text not null default 'viewer' check (role in ('admin','editor','viewer')),
  added_at  timestamptz default now(),
  primary key (user_id, org_id)
);

-- ── 2) Roster d'affichage (clé email, pour l'écran admin) ───────────
create table if not exists org_members (
  id            bigserial primary key,
  org_id        text not null references organizations(id) on delete cascade,
  email         text not null,
  name          text,
  role          text not null default 'viewer',
  active        boolean not null default true,
  invited_at    timestamptz default now(),
  last_login_at timestamptz,
  unique (org_id, email)
);

-- ── 3) Helper RLS : org_ids du user courant (optionnellement rôle min) ──
-- SECURITY DEFINER ⇒ lit user_orgs en contournant la RLS ⇒ AUCUNE récursion
-- quand les policies des tables métier appellent cette fonction.
create or replace function auth_org_ids(min_role text default null)
returns setof text
language sql stable security definer set search_path = public as $$
  select org_id from user_orgs
  where user_id = auth.uid()
    and (
      min_role is null
      or (min_role = 'viewer')
      or (min_role = 'editor' and role in ('admin','editor'))
      or (min_role = 'admin'  and role = 'admin')
    );
$$;

-- ── 4) RPC bootstrap : créer une org + s'y ajouter admin (atomique) ──
-- Évite le problème de récursion / d'auto-escalade : le client ne peut PAS
-- écrire user_orgs directement (aucune policy INSERT), mais peut créer une org
-- dont il devient admin via cette fonction contrôlée.
create or replace function create_org_with_admin(p_org_id text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into organizations(id, name) values (p_org_id, p_name)
    on conflict (id) do nothing;
  insert into user_orgs(user_id, org_id, role) values (auth.uid(), p_org_id, 'admin')
    on conflict (user_id, org_id) do update set role = 'admin';
end; $$;

-- ── RLS user_orgs : le user voit SES appartenances. Les écritures passent
--    par la service-role (Edge Function) / les RPC definer → pas de policy
--    INSERT/UPDATE/DELETE côté client (anti-escalade). ──
alter table user_orgs enable row level security;
drop policy if exists user_orgs_select_own on user_orgs;
create policy user_orgs_select_own on user_orgs for select
  using (user_id = auth.uid());

-- ── RLS org_members : membres lisent, admins gèrent ──
alter table org_members enable row level security;
drop policy if exists org_members_select on org_members;
create policy org_members_select on org_members for select
  using (org_id in (select auth_org_ids()));
drop policy if exists org_members_admin_all on org_members;
create policy org_members_admin_all on org_members for all
  using (org_id in (select auth_org_ids('admin')))
  with check (org_id in (select auth_org_ids('admin')));

-- ── RLS organizations : membres lisent leur org ──
alter table organizations enable row level security;
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations for select
  using (id in (select auth_org_ids()));

-- ════════════════════════════════════════════════════════════════════
-- 5) PATRON RLS À COPIER SUR CHAQUE TABLE MÉTIER (qui a une colonne org_id)
--    Lecture = tout membre ; écriture = editor/admin.
-- ════════════════════════════════════════════════════════════════════
-- alter table your_table enable row level security;
-- create policy yt_select on your_table for select
--   using (org_id in (select auth_org_ids()));
-- create policy yt_insert on your_table for insert
--   with check (org_id in (select auth_org_ids('editor')));
-- create policy yt_update on your_table for update
--   using (org_id in (select auth_org_ids('editor')));
-- create policy yt_delete on your_table for delete
--   using (org_id in (select auth_org_ids('editor')));
