-- supabase/migrations/20260427000060_enable_whatsapp_realtime.sql
-- Habilita postgres_changes realtime para a tabela de mensagens WhatsApp.
-- Sem isso, os subscriptions no frontend nunca disparam.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename  = 'whatsapp_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
  END IF;
END $$;
