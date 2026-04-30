alter table public.client_service_history
  add column if not exists rd_activity_id text unique;
