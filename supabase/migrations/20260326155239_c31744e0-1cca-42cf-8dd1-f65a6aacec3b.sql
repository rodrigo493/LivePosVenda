ALTER TABLE public.client_service_history 
  ADD COLUMN IF NOT EXISTS parts_sent text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS pg_number text,
  ADD COLUMN IF NOT EXISTS pa_number text;