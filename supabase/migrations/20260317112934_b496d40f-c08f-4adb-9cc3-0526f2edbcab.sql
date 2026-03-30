
CREATE TABLE public.technicians (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  specialty TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view technicians" ON public.technicians FOR SELECT TO authenticated USING (is_staff(auth.uid()));
CREATE POLICY "Admin can insert technicians" ON public.technicians FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'atendimento'::app_role));
CREATE POLICY "Admin can update technicians" ON public.technicians FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'atendimento'::app_role));
CREATE POLICY "Admin can delete technicians" ON public.technicians FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Add technician_id to products table for services
ALTER TABLE public.products ADD COLUMN technician_id UUID REFERENCES public.technicians(id);
