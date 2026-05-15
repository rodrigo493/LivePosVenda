-- Automação "Copiar Card por Status → Funil" (create_copy_if_status)
-- Problema: a automação só era enfileirada quando o card ENTRAVA numa etapa.
-- Se o status fosse alterado para o status-alvo depois (sem mover de etapa),
-- nada disparava a cópia. Esta migration adiciona o gatilho de mudança de status.

-- 1. Rastreio de cards criados como cópia (idempotência: 1 cópia por card/funil destino)
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_source_ticket_id
  ON public.tickets(source_ticket_id)
  WHERE source_ticket_id IS NOT NULL;

-- 2. Ao mudar o status de um ticket, enfileira as automações "create_copy_if_status"
--    da etapa atual do card cujo required_status bate com o novo status.
--    Reaproveita a fila (pipeline_automation_queue) processada por execute-automations.
CREATE OR REPLACE FUNCTION public.enqueue_status_change_automations()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.pipeline_id IS NOT NULL
     AND NEW.pipeline_stage IS NOT NULL THEN

    INSERT INTO public.pipeline_automation_queue (automation_id, ticket_id, stage_id, execute_at)
    SELECT a.id, NEW.id, s.id, NOW() + make_interval(mins => a.delay_minutes)
    FROM public.pipeline_stages s
    JOIN public.pipeline_stage_automations a ON a.stage_id = s.id
    WHERE s.pipeline_id = NEW.pipeline_id
      AND s.key = NEW.pipeline_stage
      AND a.is_active = true
      AND a.action_type = 'create_copy_if_status'
      AND a.action_config->>'required_status' = NEW.status::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_status_change_automations ON public.tickets;
CREATE TRIGGER trg_enqueue_status_change_automations
  AFTER UPDATE OF status ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_status_change_automations();
