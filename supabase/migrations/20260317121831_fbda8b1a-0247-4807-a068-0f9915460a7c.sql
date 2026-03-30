
-- Table for default maintenance templates per equipment model
CREATE TABLE public.model_maintenance_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.equipment_models(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  interval_months INTEGER NOT NULL DEFAULT 6,
  recommendation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add delivery_date to maintenance_plans
ALTER TABLE public.maintenance_plans ADD COLUMN delivery_date DATE;
ALTER TABLE public.maintenance_plans ADD COLUMN client_id UUID REFERENCES public.clients(id);

-- RLS for templates
ALTER TABLE public.model_maintenance_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view templates" ON public.model_maintenance_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage templates" ON public.model_maintenance_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_model_maintenance_templates_updated_at
  BEFORE UPDATE ON public.model_maintenance_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
