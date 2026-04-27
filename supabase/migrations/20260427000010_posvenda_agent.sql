-- =============================================================================
-- Agente Pós-Venda MVP
-- Tabelas: agentes_config, eventos_autonomos, entregaveis_agente
-- Seed:    agente PosVenda (Laivinha)
-- Trigger: gera evento de triagem ao abrir ticket
-- =============================================================================

-- ─── 1. agentes_config ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agentes_config (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        UNIQUE NOT NULL,
  emoji       text,
  papel       text,
  soul_prompt text        NOT NULL,
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agentes_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agentes_config_admin" ON public.agentes_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "agentes_config_staff_select" ON public.agentes_config
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE TRIGGER update_agentes_config_updated_at
  BEFORE UPDATE ON public.agentes_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. eventos_autonomos ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eventos_autonomos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pendente'
                           CHECK (status IN ('pendente','processando','concluido','erro')),
  prioridade   int         NOT NULL DEFAULT 0,
  id_agente    uuid        REFERENCES public.agentes_config(id) ON DELETE SET NULL,
  ticket_id    uuid        REFERENCES public.tickets(id) ON DELETE SET NULL,
  client_id    uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  metadata     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resultado    jsonb,
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_eventos_tipo_status ON public.eventos_autonomos (tipo, status);
CREATE INDEX IF NOT EXISTS idx_eventos_status      ON public.eventos_autonomos (status);
CREATE INDEX IF NOT EXISTS idx_eventos_ticket_id   ON public.eventos_autonomos (ticket_id);

ALTER TABLE public.eventos_autonomos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eventos_staff_select" ON public.eventos_autonomos
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "eventos_staff_insert" ON public.eventos_autonomos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

-- ─── 3. entregaveis_agente ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entregaveis_agente (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  id_agente   uuid        NOT NULL REFERENCES public.agentes_config(id) ON DELETE CASCADE,
  evento_id   uuid        REFERENCES public.eventos_autonomos(id) ON DELETE SET NULL,
  ticket_id   uuid        REFERENCES public.tickets(id) ON DELETE CASCADE,
  tipo        text        NOT NULL,
  conteudo_md text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entregaveis_agente_ts
  ON public.entregaveis_agente (id_agente, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregaveis_ticket
  ON public.entregaveis_agente (ticket_id, created_at DESC);

ALTER TABLE public.entregaveis_agente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entregaveis_staff_select" ON public.entregaveis_agente
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- ─── 4. Seed: agente Pós-Venda ───────────────────────────────────────────────
INSERT INTO public.agentes_config (nome, emoji, papel, soul_prompt)
VALUES (
  'PosVenda',
  '🤖',
  'Triagem de tickets de pós-venda',
  'Você é a Laivinha, assistente de pós-venda da Live Equipamentos.
Objetivo: acelerar resolução de chamados, reduzir retrabalho e preparar o time com informações completas.

Para cada ticket analise e responda com:
1. **Resumo** (1-2 frases): o que o cliente relatou
2. **Informações faltantes** (checklist markdown): verifique número de série, fotos do defeito, nota fiscal/comprovante de compra, endereço completo para envio, vídeo do problema
3. **Próximo passo**: orientação objetiva ao atendente

Regras obrigatórias:
- Linguagem PT-BR direta e profissional
- Nunca prometa prazos de resolução
- Nunca execute cobranças, emissão de notas ou ações financeiras
- Se faltar informação crítica, sinalize claramente e oriente como obtê-la'
)
ON CONFLICT (nome) DO UPDATE SET
  emoji       = EXCLUDED.emoji,
  papel       = EXCLUDED.papel,
  soul_prompt = EXCLUDED.soul_prompt,
  updated_at  = now();

-- ─── 5. Função de trigger: criar evento ao abrir ticket ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_ticket_criar_evento_triagem()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.eventos_autonomos (tipo, id_agente, ticket_id, client_id, metadata, prioridade)
  SELECT
    'triagem_ticket',
    ac.id,
    NEW.id,
    NEW.client_id,
    jsonb_build_object(
      'status',   NEW.status,
      'priority', NEW.priority,
      'title',    NEW.title
    ),
    CASE NEW.priority
      WHEN 'urgente' THEN 10
      WHEN 'alta'    THEN 5
      ELSE 0
    END
  FROM public.agentes_config ac
  WHERE ac.nome = 'PosVenda' AND ac.ativo = true
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_criar_evento_triagem ON public.tickets;
CREATE TRIGGER trg_ticket_criar_evento_triagem
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ticket_criar_evento_triagem();
