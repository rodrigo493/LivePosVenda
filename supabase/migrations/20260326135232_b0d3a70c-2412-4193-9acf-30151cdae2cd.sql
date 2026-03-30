
-- Add client_code column
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS client_code text UNIQUE;

-- Create function to auto-generate client code
CREATE OR REPLACE FUNCTION public.generate_client_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(client_code FROM 5) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.clients
  WHERE client_code IS NOT NULL AND client_code ~ '^CLI-[0-9]+$';
  
  NEW.client_code := 'CLI-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER set_client_code
  BEFORE INSERT ON public.clients
  FOR EACH ROW
  WHEN (NEW.client_code IS NULL)
  EXECUTE FUNCTION public.generate_client_code();
