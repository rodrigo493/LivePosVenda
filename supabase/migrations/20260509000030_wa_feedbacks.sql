create table if not exists wa_feedbacks (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references clients(id) on delete cascade,
  user_id             uuid references auth.users(id),
  instance_id         uuid references pipeline_whatsapp_instances(id),
  score_overall       numeric(4,2),
  score_response_time numeric(4,2),
  score_tone          numeric(4,2),
  score_commercial    numeric(4,2),
  summary             text,
  recommendations     jsonb default '[]'::jsonb,
  alert_level         text check (alert_level in ('ok','warning','critical')),
  status              text default 'pending' check (status in ('pending','done','error')),
  run_id              text,
  raw_response        text,
  created_at          timestamptz default now()
);

alter table wa_feedbacks enable row level security;

create policy "wa_feedbacks_user_own" on wa_feedbacks
  for select using (user_id = auth.uid());

create policy "wa_feedbacks_admin_all" on wa_feedbacks
  for select using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid() and role = 'admin'::app_role
    )
  );
