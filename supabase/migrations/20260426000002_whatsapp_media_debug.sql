-- Diagnostic column: stores the reason media download failed.
-- Allows querying the DB instead of needing dashboard log access.
-- Will be removed once the download issue is resolved.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_debug JSONB;
