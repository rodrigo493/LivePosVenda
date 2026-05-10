-- Registra quando o contrato PDF foi gerado pela primeira vez para exibição
-- na extensão do WhatsApp e tag "CONTRATO" no kanban.
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS contract_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_service_requests_contract_generated_at
  ON public.service_requests (contract_generated_at)
  WHERE contract_generated_at IS NOT NULL;
