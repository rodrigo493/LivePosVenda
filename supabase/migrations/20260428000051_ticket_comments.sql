-- Tabela de comentários/anotações de tickets (usada pela integração RD Station e futuramente por usuários)
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  content         TEXT        NOT NULL,
  rd_activity_id  TEXT        UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;

-- Staff lê comentários dos tickets que pode ver
CREATE POLICY "tc_select" ON public.ticket_comments
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- Autor ou admin pode inserir
CREATE POLICY "tc_insert" ON public.ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
  );

-- Só admin pode deletar
CREATE POLICY "tc_delete" ON public.ticket_comments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_tc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_tc_updated_at
  BEFORE UPDATE ON public.ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_tc_updated_at();
