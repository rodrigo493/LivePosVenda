-- supabase/migrations/20260502000020_loss_reasons.sql

-- 1. Tabela de catálogo de motivos
CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de vínculo N:N ticket ↔ motivo
CREATE TABLE public.ticket_loss_reasons (
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  loss_reason_id UUID NOT NULL REFERENCES public.loss_reasons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, loss_reason_id)
);

-- 3. View com contagem de tickets por motivo
CREATE OR REPLACE VIEW public.loss_reasons_with_count AS
SELECT
  lr.id,
  lr.label,
  lr.active,
  lr.position,
  lr.created_at,
  COUNT(tlr.ticket_id)::INTEGER AS ticket_count
FROM public.loss_reasons lr
LEFT JOIN public.ticket_loss_reasons tlr ON lr.id = tlr.loss_reason_id
GROUP BY lr.id;

-- 4. RLS para loss_reasons
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loss_reasons_select" ON public.loss_reasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "loss_reasons_insert" ON public.loss_reasons
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loss_reasons_update" ON public.loss_reasons
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 5. RLS para ticket_loss_reasons
ALTER TABLE public.ticket_loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_loss_reasons_select" ON public.ticket_loss_reasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_loss_reasons_insert" ON public.ticket_loss_reasons
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ticket_loss_reasons_delete" ON public.ticket_loss_reasons
  FOR DELETE TO authenticated USING (true);

-- 6. Grants
GRANT SELECT ON public.loss_reasons_with_count TO authenticated;

-- 7. Seed — 20 motivos padrão
INSERT INTO public.loss_reasons (label, position) VALUES
  ('Cliente acha que não é o momento', 1),
  ('Cliente não avançou por dependência de terceiros', 2),
  ('Cliente optou por adiar a decisão sem justificativa clara', 3),
  ('Cliente quer muito o(s) equipamento(s), mas não tem dinheiro', 4),
  ('Condição de pagamento não atendeu', 5),
  ('Duplicidade de cadastro', 6),
  ('Duplicidade de negociação', 7),
  ('Falta de dados para contato', 8),
  ('Falta de espaço', 9),
  ('Fechou com o concorrente', 10),
  ('Frete elevado', 11),
  ('Interagiu inicialmente, mas deixou de responder', 12),
  ('Lead buscou por equipamentos que não é portfólio da empresa', 13),
  ('Lead desqualificado', 14),
  ('Lead sem engajamento desde que entrou', 15),
  ('Não conseguiu financiamento', 16),
  ('Prazo de entrega não atende', 17),
  ('Preço acima do esperado', 18),
  ('Produto não atende', 19),
  ('Sem interação após envio da proposta', 20);
