-- Permite client_id nulo em whatsapp_messages para acomodar mensagens
-- de números não cadastrados como clientes no CRM.
-- A constraint de FK é mantida (quando preenchido, deve existir em clients).
ALTER TABLE public.whatsapp_messages
  ALTER COLUMN client_id DROP NOT NULL;
