
-- Add procedure text field to model_maintenance_templates
ALTER TABLE public.model_maintenance_templates 
  ADD COLUMN IF NOT EXISTS procedure_text text;

-- Create junction table for parts linked to maintenance templates
CREATE TABLE public.maintenance_template_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.model_maintenance_templates(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, product_id)
);

ALTER TABLE public.maintenance_template_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view template parts"
  ON public.maintenance_template_parts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage template parts"
  ON public.maintenance_template_parts FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
