-- Catálogo de produtos para negociações (CRM / RD Station)
CREATE TABLE public.deal_catalog_products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  base_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  visible     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.deal_catalog_products ENABLE ROW LEVEL SECURITY;

-- Staff pode ler todos
CREATE POLICY "dcp_select" ON public.deal_catalog_products
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

-- Admin pode tudo
CREATE POLICY "dcp_admin_write" ON public.deal_catalog_products
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_dcp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_dcp_updated_at
  BEFORE UPDATE ON public.deal_catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.set_dcp_updated_at();
