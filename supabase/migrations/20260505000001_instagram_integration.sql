-- supabase/migrations/20260505000001_instagram_integration.sql

-- 1. Conta conectada (único registro)
create table if not exists public.instagram_account (
  id               uuid primary key default gen_random_uuid(),
  ig_user_id       text not null unique,
  username         text not null,
  picture_url      text,
  access_token     text not null,
  token_expires_at timestamptz not null,
  connected_at     timestamptz default now(),
  updated_at       timestamptz default now()
);
alter table public.instagram_account enable row level security;
create policy "admin lê instagram_account"
  on public.instagram_account for select
  using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
create policy "service_role escreve instagram_account"
  on public.instagram_account for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 2. Conversas (uma por remetente)
create table if not exists public.instagram_conversations (
  id               uuid primary key default gen_random_uuid(),
  ig_sender_id     text not null unique,
  sender_username  text,
  sender_picture   text,
  last_message     text,
  last_message_at  timestamptz default now(),
  unread_count     int not null default 0,
  assigned_user_id uuid references public.profiles(user_id) on delete set null,
  client_id        uuid references public.clients(id) on delete set null,
  created_at       timestamptz default now()
);
alter table public.instagram_conversations enable row level security;
create policy "staff lê instagram_conversations"
  on public.instagram_conversations for select
  using (exists (select 1 from public.user_roles where user_id = auth.uid()));
create policy "service_role escreve instagram_conversations"
  on public.instagram_conversations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index on public.instagram_conversations (last_message_at desc);

-- 3. Mensagens
create table if not exists public.instagram_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.instagram_conversations(id) on delete cascade,
  ig_message_id   text unique,
  message_type    text not null check (message_type in ('dm', 'comment', 'story_mention')),
  direction       text not null check (direction in ('inbound', 'outbound')),
  content         text,
  media_url       text,
  post_id         text,
  post_url        text,
  created_at      timestamptz default now()
);
alter table public.instagram_messages enable row level security;
create policy "staff lê instagram_messages"
  on public.instagram_messages for select
  using (exists (select 1 from public.user_roles where user_id = auth.uid()));
create policy "service_role escreve instagram_messages"
  on public.instagram_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index on public.instagram_messages (conversation_id, created_at);

-- 4. Log de webhooks para debug
create table if not exists public.instagram_webhook_log (
  id           uuid primary key default gen_random_uuid(),
  payload      jsonb,
  processed_at timestamptz default now()
);
alter table public.instagram_webhook_log enable row level security;
create policy "admin lê instagram_webhook_log"
  on public.instagram_webhook_log for select
  using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
create policy "service_role escreve instagram_webhook_log"
  on public.instagram_webhook_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 5. Coluna instagram_id na tabela clients existente
alter table public.clients add column if not exists instagram_id text unique;
