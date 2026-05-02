-- 1. Permite a mesma instância Uazapi em múltiplos fluxos:
--    remove unicidade global, mantém unicidade apenas dentro do mesmo fluxo
DROP INDEX IF EXISTS idx_pwi_uazapi_name;

CREATE UNIQUE INDEX idx_pwi_pipeline_uazapi
  ON public.pipeline_whatsapp_instances (pipeline_id, uazapi_instance_name);

-- 2. Permite excluir uma instância mesmo quando há mensagens vinculadas:
--    troca o FK padrão (RESTRICT) por ON DELETE SET NULL
ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_instance_id_fkey;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_instance_id_fkey
  FOREIGN KEY (instance_id)
  REFERENCES public.pipeline_whatsapp_instances(id)
  ON DELETE SET NULL;
