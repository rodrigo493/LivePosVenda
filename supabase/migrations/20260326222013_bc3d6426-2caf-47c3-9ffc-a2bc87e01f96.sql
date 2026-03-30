
CREATE OR REPLACE FUNCTION public.generate_ticket_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  prefix TEXT;
  seq_num INTEGER;
BEGIN
  CASE NEW.ticket_type
    WHEN 'chamado_tecnico' THEN prefix := 'CH';
    WHEN 'garantia' THEN prefix := 'GT';
    WHEN 'assistencia' THEN prefix := 'AS';
    WHEN 'pos_venda' THEN prefix := 'PV';
    WHEN 'comprar_acessorios' THEN prefix := 'AC';
    ELSE prefix := 'TK';
  END CASE;

  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.tickets
  WHERE ticket_number LIKE prefix || '-%';

  NEW.ticket_number := prefix || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;
