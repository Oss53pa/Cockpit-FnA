-- Attention points
create table if not exists attention_points (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  severity text not null default 'medium',
  probability text not null default 'medium',
  category text not null default '',
  source text,
  owner text,
  detected_at bigint not null,
  detected_by text,
  target_resolution_date date,
  estimated_financial_impact numeric(18,2),
  impact_description text,
  root_cause text,
  recommendation text,
  tags text[],
  status text not null default 'open',
  resolved_at bigint,
  resolved_note text,
  last_reviewed_at bigint,
  journal text
);

-- Action plans
create table if not exists action_plans (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  attention_point_id bigint references attention_points(id) on delete set null,
  title text not null,
  description text,
  owner text not null default '',
  team text,
  sponsor text,
  start_date date,
  due_date date,
  review_date date,
  priority text not null default 'medium',
  status text not null default 'todo',
  progress int not null default 0,
  budget_allocated numeric(18,2),
  resources_needed text,
  deliverables text,
  success_criteria text,
  estimated_impact text,
  dependencies text,
  blockers text,
  journal text,
  tags text[],
  created_at bigint not null,
  updated_at bigint not null,
  completed_at bigint
);

-- RLS
alter table attention_points enable row level security;
alter table action_plans enable row level security;

create policy "Users see attention_points" on attention_points for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage attention_points" on attention_points for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));

create policy "Users see action_plans" on action_plans for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Editors manage action_plans" on action_plans for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role in ('admin','editor')));
