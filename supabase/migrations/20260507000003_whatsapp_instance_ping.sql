-- Adiciona campo de heartbeat da extensão em pipeline_whatsapp_instances.
-- A extensão atualiza este campo a cada 4 min (keepalive alarm).
-- CRM usa para determinar se a extensão está ativa (< 5 min = online).

ALTER TABLE public.pipeline_whatsapp_instances
  ADD COLUMN IF NOT EXISTS extension_last_ping timestamptz;
