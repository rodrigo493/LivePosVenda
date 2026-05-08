-- Cria o bucket whatsapp-audio para armazenar áudios do WhatsApp
-- EXECUTAR NO SUPABASE SQL EDITOR (não via CLI — requer acesso ao storage schema)

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-audio', 'whatsapp-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: usuários autenticados podem fazer upload
CREATE POLICY IF NOT EXISTS "authenticated upload whatsapp-audio"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'whatsapp-audio');

-- Policy: leitura pública (para renderizar URL no histórico do card)
CREATE POLICY IF NOT EXISTS "public read whatsapp-audio"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'whatsapp-audio');
