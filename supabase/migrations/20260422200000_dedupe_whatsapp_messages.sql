-- Remove duplicate inbound messages that share a manychat_message_id
-- (keep the earliest) and add a partial unique index to prevent races.
-- Why: two parallel Uazapi webhooks hitting the function raced through
-- the application-level "select then insert" dedupe, producing pairs
-- of identical rows visible in the chat.

WITH ranked AS (
  SELECT id,
         manychat_message_id,
         ROW_NUMBER() OVER (PARTITION BY manychat_message_id ORDER BY created_at ASC) AS rn
  FROM public.whatsapp_messages
  WHERE manychat_message_id IS NOT NULL
)
DELETE FROM public.whatsapp_messages wm
USING ranked r
WHERE wm.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_messages_manychat_message_id_unique
  ON public.whatsapp_messages (manychat_message_id)
  WHERE manychat_message_id IS NOT NULL;
