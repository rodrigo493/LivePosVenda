
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM '[0-9]+$') AS INTEGER)), 827) + 1
  INTO seq_num
  FROM public.quotes
  WHERE quote_number LIKE 'OC.%';

  NEW.quote_number := 'OC.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_pa_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 536) + 1
  INTO seq_num
  FROM public.service_requests
  WHERE request_number LIKE 'PA.%';

  RETURN 'PA.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || LPAD(seq_num::TEXT, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_pg_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(claim_number FROM '[0-9]+$') AS INTEGER)), 127) + 1
  INTO seq_num
  FROM public.warranty_claims
  WHERE claim_number LIKE 'PG.%';

  RETURN 'PG.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || LPAD(seq_num::TEXT, 3, '0');
END;
$$;
