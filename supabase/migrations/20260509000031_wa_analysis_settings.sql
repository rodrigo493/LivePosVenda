create table if not exists wa_analysis_settings (
  id               uuid primary key default gen_random_uuid(),
  trigger_type     text default 'manual' check (trigger_type in ('manual','scheduled')),
  schedule_cron    text default '0 22 * * *',
  alert_threshold  numeric(4,2) default 5.0,
  agent_id         text default 'agente-feedback-wa',
  updated_at       timestamptz default now()
);

insert into wa_analysis_settings (id)
  values ('00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing;
