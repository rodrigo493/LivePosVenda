-- Armazena o JID do WhatsApp (ex: 5511987654321@s.whatsapp.net) para lookup
-- direto sem depender de variações de formato de telefone.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS wa_jid TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_wa_jid ON public.clients (wa_jid);
