
-- Add origin, channel and AI triage fields to tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ai_triage JSONB DEFAULT NULL;

-- Create table to store WhatsApp intake logs for future analytics
CREATE TABLE public.whatsapp_intake_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  client_phone TEXT NOT NULL,
  client_name TEXT,
  original_message TEXT NOT NULL,
  equipment_informed TEXT,
  serial_number TEXT,
  ai_response JSONB,
  ai_model TEXT,
  ai_success BOOLEAN DEFAULT false,
  manychat_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_intake_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view intake logs" ON public.whatsapp_intake_logs
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "System can insert intake logs" ON public.whatsapp_intake_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

-- Allow public insert for webhook (service role will handle this)
CREATE POLICY "Anon can insert intake logs" ON public.whatsapp_intake_logs
  FOR INSERT TO anon
  WITH CHECK (true);
