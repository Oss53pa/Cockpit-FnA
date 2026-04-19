-- Email logs
create table if not exists email_logs (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  report_id bigint references reports(id) on delete set null,
  recipients text[] not null default '{}',
  subject text not null default '',
  status text not null default 'pending' check (status in ('pending','sent','failed','bounced')),
  sent_at timestamptz not null default now(),
  error text
);

create index idx_email_logs_org on email_logs(org_id, sent_at desc);

-- Email schedules (automatic send)
create table if not exists email_schedules (
  id bigserial primary key,
  org_id text not null references organizations(id) on delete cascade,
  report_type text not null,
  frequency text not null check (frequency in ('weekly','monthly','quarterly')),
  day_of_week int check (day_of_week between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  hour int not null default 8 check (hour between 0 and 23),
  recipients text[] not null default '{}',
  enabled boolean not null default true,
  last_sent_at timestamptz,
  next_run_at timestamptz not null default now()
);

create index idx_email_schedules_next on email_schedules(enabled, next_run_at);

-- RLS
alter table email_logs enable row level security;
alter table email_schedules enable row level security;

create policy "Users see email_logs" on email_logs for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Admins manage email_logs" on email_logs for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role = 'admin'));

create policy "Users see email_schedules" on email_schedules for select
  using (org_id in (select org_id from user_orgs where user_id = auth.uid()));
create policy "Admins manage email_schedules" on email_schedules for all
  using (org_id in (select org_id from user_orgs where user_id = auth.uid() and role = 'admin'));

-- Realtime subscriptions for collaborative features
alter publication supabase_realtime add table attention_points;
alter publication supabase_realtime add table action_plans;
alter publication supabase_realtime add table reports;
