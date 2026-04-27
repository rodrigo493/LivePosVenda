-- =============================================================================
-- Memória Problema → Solução (base de conhecimento do agente Pós-Venda)
-- Inclui: tabela, FTS, RLS, trigger updated_at
--         trigger auto-rascunho ao encerrar ticket
-- =============================================================================

-- ─── 1. Tabela principal ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.memoria_problema_solucao (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_aparelho    text        NOT NULL,
  sintoma            text        NOT NULL,
  causa_raiz         text,
  solucao_md         text        NOT NULL,
  pecas              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  evidencias_urls    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tags               text[]      NOT NULL DEFAULT '{}',
  aprovada           boolean     NOT NULL DEFAULT false,
  origem_ticket_id   uuid        REFERENCES public.tickets(id) ON DELETE SET NULL,
  criado_por         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- Gerado automaticamente para full-text search em português
  ts_search          tsvector    GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      COALESCE(modelo_aparelho, '') || ' ' ||
      COALESCE(sintoma,         '') || ' ' ||
      COALESCE(causa_raiz,      '') || ' ' ||
      COALESCE(solucao_md,      '')
    )
  ) STORED
);

-- ─── 2. Índices ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_memoria_modelo     ON public.memoria_problema_solucao (modelo_aparelho);
CREATE INDEX IF NOT EXISTS idx_memoria_aprovada   ON public.memoria_problema_solucao (aprovada, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memoria_fts        ON public.memoria_problema_solucao USING GIN (ts_search);
CREATE INDEX IF NOT EXISTS idx_memoria_ticket     ON public.memoria_problema_solucao (origem_ticket_id);

-- ─── 3. Trigger updated_at ───────────────────────────────────────────────────
CREATE TRIGGER update_memoria_updated_at
  BEFORE UPDATE ON public.memoria_problema_solucao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.memoria_problema_solucao ENABLE ROW LEVEL SECURITY;

-- Staff visualiza tudo
CREATE POLICY "memoria_staff_select" ON public.memoria_problema_solucao
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Admin faz tudo (aprovações, edições, exclusões)
CREATE POLICY "memoria_admin_all" ON public.memoria_problema_solucao
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Staff pode inserir rascunhos (aprovada=false obrigatório)
CREATE POLICY "memoria_staff_insert_rascunho" ON public.memoria_problema_solucao
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND aprovada = false);

-- =============================================================================
-- 5. Trigger: gerar rascunho ao encerrar ticket
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_ticket_gerar_rascunho_memoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modelo_aparelho text;
  v_sintoma         text;
  v_solucao_md      text;
  v_entregavel_md   text;
BEGIN
  -- Ativa apenas quando status muda PARA resolvido/fechado
  IF NEW.status NOT IN ('resolvido', 'fechado') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('resolvido', 'fechado') THEN
    RETURN NEW;
  END IF;

  -- Evita duplicatas se trigger disparar mais de uma vez para o mesmo ticket
  IF EXISTS (
    SELECT 1 FROM public.memoria_problema_solucao
    WHERE origem_ticket_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- Modelo do equipamento via join (nullable — ticket pode não ter equipment_id)
  SELECT em.name INTO v_modelo_aparelho
  FROM   public.equipments       e
  JOIN   public.equipment_models em ON em.id = e.model_id
  WHERE  e.id = NEW.equipment_id
  LIMIT  1;

  v_modelo_aparelho := COALESCE(v_modelo_aparelho, 'Equipamento não identificado');

  -- Sintoma: título + início da descrição
  v_sintoma := NEW.title;
  IF NEW.description IS NOT NULL AND trim(NEW.description) <> '' THEN
    v_sintoma := v_sintoma || '. ' || left(trim(NEW.description), 400);
  END IF;

  -- Solução: prefere último entregável do agente, depois internal_notes
  SELECT ea.conteudo_md INTO v_entregavel_md
  FROM   public.entregaveis_agente ea
  WHERE  ea.ticket_id = NEW.id
  ORDER  BY ea.created_at DESC
  LIMIT  1;

  IF v_entregavel_md IS NOT NULL AND trim(v_entregavel_md) <> '' THEN
    v_solucao_md := v_entregavel_md;
  ELSIF NEW.internal_notes IS NOT NULL AND trim(NEW.internal_notes) <> '' THEN
    v_solucao_md := '## Notas internas do atendimento' || chr(10) || NEW.internal_notes;
  ELSE
    v_solucao_md := 'SOLUÇÃO A DEFINIR';
  END IF;

  INSERT INTO public.memoria_problema_solucao (
    modelo_aparelho, sintoma, solucao_md, aprovada, origem_ticket_id, criado_por
  ) VALUES (
    v_modelo_aparelho,
    v_sintoma,
    v_solucao_md,
    false,          -- sempre começa como rascunho, humano aprova
    NEW.id,
    NEW.assigned_to
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_gerar_rascunho_memoria ON public.tickets;
CREATE TRIGGER trg_ticket_gerar_rascunho_memoria
  AFTER UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ticket_gerar_rascunho_memoria();
