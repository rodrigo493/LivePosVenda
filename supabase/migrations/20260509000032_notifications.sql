create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text,
  title       text,
  body        text,
  link        text,
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table notifications enable row level security;

create policy "notifications_own" on notifications
  for all using (user_id = auth.uid());

create index notifications_user_unread
  on notifications(user_id, read, created_at desc);
