-- Track when the staff last read the WhatsApp conversation with a client.
-- Used to compute unread_count on the chat sidebar and on kanban cards.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_last_read_at timestamptz;
