-- Ajusta os contadores de PA e PD para os valores corretos:
--   Próximo PA = PA.26.564
--   Próximo PD = PD.26.2058
--
-- PA: recalcula com MAX real, garantindo mínimo 563 (para que next = 564)
-- PD: corrige formato para incluir ano (PD.26.XXXX) e define mínimo 2057 (para que next = 2058)

-- ── generate_pa_number ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_pa_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 563) + 1
  INTO seq_num
  FROM public.service_requests
  WHERE request_number LIKE 'PA.%';

  -- Garante mínimo de 564 mesmo que registros antigos sejam menores
  IF seq_num < 564 THEN
    seq_num := 564;
  END IF;

  RETURN 'PA.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || LPAD(seq_num::TEXT, 3, '0');
END;
$$;

-- ── generate_pd_number ──────────────────────────────────────────────────────
-- Corrige o formato para incluir o ano (PA.YY.XXXX) e define contador a partir de 2057
-- Filtra apenas registros no novo formato (PD.26.%) para ignorar os antigos (PD.XXXX)
CREATE OR REPLACE FUNCTION public.generate_pd_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM '[0-9]+$') AS INTEGER)), 2057) + 1
  INTO next_num
  FROM public.service_requests
  WHERE request_number LIKE 'PD.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.%';

  -- Garante mínimo de 2058 mesmo que não haja registros no novo formato
  IF next_num < 2058 THEN
    next_num := 2058;
  END IF;

  RETURN 'PD.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || next_num::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_pa_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pd_number() TO authenticated;
