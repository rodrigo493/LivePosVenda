-- Cria o bucket whatsapp-audio para armazenar áudios do WhatsApp
-- EXECUTAR NO SUPABASE SQL EDITOR (não via CLI — requer acesso ao storage schema)

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-audio', 'whatsapp-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: usuários autenticados podem fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'authenticated upload whatsapp-audio'
  ) THEN
    CREATE POLICY "authenticated upload whatsapp-audio"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'whatsapp-audio');
  END IF;
END $$;

-- Policy: leitura pública (para renderizar URL no histórico do card)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public read whatsapp-audio'
  ) THEN
    CREATE POLICY "public read whatsapp-audio"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'whatsapp-audio');
  END IF;
END $$;
