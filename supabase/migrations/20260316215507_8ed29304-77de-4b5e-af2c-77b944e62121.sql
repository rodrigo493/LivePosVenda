
-- Product compatibility table: links products to equipment_models
CREATE TABLE public.product_compatibility (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.equipment_models(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, model_id)
);

-- Indexes
CREATE INDEX idx_product_compat_product ON public.product_compatibility(product_id);
CREATE INDEX idx_product_compat_model ON public.product_compatibility(model_id);

-- RLS
ALTER TABLE public.product_compatibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view product compatibility"
  ON public.product_compatibility FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff can insert product compatibility"
  ON public.product_compatibility FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financeiro') OR has_role(auth.uid(), 'tecnico'));

CREATE POLICY "Staff can update product compatibility"
  ON public.product_compatibility FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financeiro') OR has_role(auth.uid(), 'tecnico'));

CREATE POLICY "Staff can delete product compatibility"
  ON public.product_compatibility FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'financeiro'));

-- Updated_at trigger
CREATE TRIGGER update_product_compatibility_updated_at
  BEFORE UPDATE ON public.product_compatibility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
