-- supabase/migrations/20260508000001_ticket_products.sql
CREATE TABLE public.ticket_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES public.deal_catalog_products(id),
  name        TEXT NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_staff_all" ON public.ticket_products
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX idx_ticket_products_ticket_id ON public.ticket_products(ticket_id);
