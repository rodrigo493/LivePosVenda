-- 1. Adiciona delay_minutes às automações
ALTER TABLE public.pipeline_stage_automations
  ADD COLUMN IF NOT EXISTS delay_minutes INT NOT NULL DEFAULT 0;

-- 2. Tabela de fila de execução
CREATE TABLE IF NOT EXISTS public.pipeline_automation_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID        NOT NULL REFERENCES public.pipeline_stage_automations(id) ON DELETE CASCADE,
  ticket_id     UUID        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  stage_id      UUID        NOT NULL REFERENCES public.pipeline_stages(id),
  execute_at    TIMESTAMPTZ NOT NULL,
  executed_at   TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'pending',
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_automation_queue_pending_idx
  ON public.pipeline_automation_queue (execute_at)
  WHERE status = 'pending';

-- RLS: edge functions usam service_role, desabilitamos RLS para a fila
ALTER TABLE public.pipeline_automation_queue DISABLE ROW LEVEL SECURITY;

-- RPC para claims atômicos na fila (usado pelo execute-automations)
CREATE OR REPLACE FUNCTION public.claim_automation_queue(batch_size INT DEFAULT 50)
RETURNS TABLE(
  id UUID, automation_id UUID, ticket_id UUID, stage_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.pipeline_automation_queue q
  SET status = 'processing'
  WHERE q.id IN (
    SELECT q2.id FROM public.pipeline_automation_queue q2
    WHERE q2.status = 'pending' AND q2.execute_at <= NOW()
    ORDER BY q2.execute_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.id, q.automation_id, q.ticket_id, q.stage_id;
END;
$$;
