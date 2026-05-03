-- Add document_type to distinguish PA (acessórios) from PD (pedidos de venda)
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'pa';

-- Ensure all existing rows are tagged as PA
UPDATE public.service_requests SET document_type = 'pa' WHERE document_type IS NULL OR document_type = '';

-- Sequence generator for PD numbers (mirrors generate_pa_number)
CREATE OR REPLACE FUNCTION public.generate_pd_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.service_requests
  WHERE request_number LIKE 'PD.%';
  RETURN 'PD.' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_pd_number() TO authenticated;
