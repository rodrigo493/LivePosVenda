create table if not exists wa_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references clients(id) on delete cascade,
  user_id            uuid references auth.users(id),
  instance_id        uuid references pipeline_whatsapp_instances(id),
  inbound_message    text,
  suggested_response text,
  status             text default 'pending' check (status in ('pending','done','error')),
  run_id             text,
  created_at         timestamptz default now()
);

alter table wa_suggestions enable row level security;

create policy "wa_suggestions_user_own" on wa_suggestions
  for select using (user_id = auth.uid());
