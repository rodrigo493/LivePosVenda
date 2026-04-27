-- Add media_url and media_mime_type columns to whatsapp_messages.
-- These were missing: the feature code (d6ab60e) was deployed without the schema migration,
-- causing media_url to be silently discarded on every INSERT.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_mime_type text;

-- Create the whatsapp-media Storage bucket used by both send-whatsapp
-- and whatsapp-webhook Edge Functions. public=true enables anonymous reads
-- (required for getPublicUrl to work).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', true, 52428800)
ON CONFLICT (id) DO NOTHING;
