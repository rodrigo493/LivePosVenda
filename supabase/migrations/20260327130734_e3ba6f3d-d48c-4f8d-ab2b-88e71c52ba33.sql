
CREATE OR REPLACE FUNCTION public.generate_work_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.work_orders
  WHERE order_number LIKE 'OS.%';

  NEW.order_number := 'OS.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$;
