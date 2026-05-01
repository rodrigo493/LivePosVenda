-- Adiciona vínculo de usuário às instâncias WhatsApp por fluxo
ALTER TABLE pipeline_whatsapp_instances
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pwi_user_id ON pipeline_whatsapp_instances(user_id);
