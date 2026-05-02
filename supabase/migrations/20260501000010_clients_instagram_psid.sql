-- Adiciona PSID do Instagram em clients para deduplicar leads vindos de DMs
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS instagram_psid TEXT UNIQUE;
