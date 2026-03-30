
CREATE TABLE public.historical_import_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_log_id UUID REFERENCES public.import_logs(id) ON DELETE CASCADE,
  source_file TEXT,
  source_row INTEGER,
  client_name TEXT,
  product_name TEXT,
  problem_description TEXT,
  solution TEXT,
  status TEXT,
  reference_date TIMESTAMP WITH TIME ZONE,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  equipment_id UUID REFERENCES public.equipments(id) ON DELETE SET NULL,
  raw_data JSONB,
  import_status TEXT DEFAULT 'importado',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.historical_import_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view historical imports" ON public.historical_import_records
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert historical imports" ON public.historical_import_records
  FOR INSERT TO authenticated WITH CHECK (is_staff(auth.uid()));
