-- Adiciona a coluna `message` à tabela livecrm_followups.
-- Usada pela extensão LiveCRM WA (v1.3.5+): quando o follow-up agendado vence,
-- o background dispara automaticamente esta mensagem no WhatsApp via INJECT_SEND.
ALTER TABLE public.livecrm_followups
  ADD COLUMN IF NOT EXISTS message TEXT DEFAULT '';
