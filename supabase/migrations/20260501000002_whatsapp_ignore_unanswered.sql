-- Timestamp global: só contam como "sem resposta" mensagens chegadas APÓS este instante.
-- Quando o usuário clica "Zerar" (ou a notificação diária é enviada), este campo é atualizado para NOW().
ALTER TABLE public.rd_integration_config
  ADD COLUMN IF NOT EXISTS unanswered_ack_at TIMESTAMPTZ;
