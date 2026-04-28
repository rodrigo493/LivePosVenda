-- Fixes para integração RD Station

-- 1. Adicionar valores faltantes ao enum ticket_status
--    (necessários para mapear deal perdido e deal pausado do RD Station)
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'cancelado';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'pausado';

-- 2. Tornar webhook_secret NOT NULL (sempre tem default)
ALTER TABLE public.rd_integration_config
  ALTER COLUMN webhook_secret SET NOT NULL,
  ALTER COLUMN webhook_secret SET DEFAULT (replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', ''));

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_author_id ON public.ticket_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_rd_sync_log_created_at   ON public.rd_sync_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rd_sync_log_rd_id        ON public.rd_sync_log(rd_id);
CREATE INDEX IF NOT EXISTS idx_rd_sync_log_status       ON public.rd_sync_log(status);

-- 4. UPDATE policy em ticket_comments (admin pode editar qualquer; autor pode editar o próprio)
CREATE POLICY "tc_update" ON public.ticket_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
