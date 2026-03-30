
-- 1. Add number columns to service_requests and warranty_claims
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS request_number text;
ALTER TABLE public.warranty_claims ADD COLUMN IF NOT EXISTS claim_number text;

-- 2. Update quote number generator to use OC prefix
CREATE OR REPLACE FUNCTION public.generate_quote_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.quotes;
  NEW.quote_number := 'OC-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$function$;
