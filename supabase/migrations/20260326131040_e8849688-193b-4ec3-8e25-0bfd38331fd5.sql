
CREATE TABLE public.client_service_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  device TEXT,
  problem_reported TEXT,
  solution_provided TEXT,
  service_status TEXT NOT NULL DEFAULT 'concluido',
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_service_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view client history" ON public.client_service_history
  FOR SELECT TO authenticated USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert client history" ON public.client_service_history
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'atendimento'::app_role)
  );

CREATE POLICY "Staff can update client history" ON public.client_service_history
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'atendimento'::app_role)
  );

CREATE POLICY "Staff can delete client history" ON public.client_service_history
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin'::app_role)
  );
