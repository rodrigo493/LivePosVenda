-- Corrige mark_client_whatsapp_read para atualizar TODOS os clientes
-- que compartilham o mesmo número de telefone (últimos 8 dígitos).
-- Isso garante que conversas de clientes duplicados no banco sejam
-- marcadas como lidas corretamente, apagando o destaque laranja.

CREATE OR REPLACE FUNCTION public.mark_client_whatsapp_read(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_digits text;
BEGIN
  -- Normaliza o telefone para os últimos 8 dígitos (mesmo critério do frontend)
  SELECT RIGHT(REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g'), 8)
  INTO v_phone_digits
  FROM public.clients
  WHERE id = p_client_id;

  IF v_phone_digits IS NOT NULL AND LENGTH(v_phone_digits) >= 6 THEN
    -- Atualiza todos os clientes com o mesmo número de telefone
    UPDATE public.clients
    SET whatsapp_last_read_at = now()
    WHERE RIGHT(REGEXP_REPLACE(COALESCE(whatsapp, phone, ''), '[^0-9]', '', 'g'), 8) = v_phone_digits;
  ELSE
    -- Fallback: sem telefone, atualiza apenas pelo ID
    UPDATE public.clients
    SET whatsapp_last_read_at = now()
    WHERE id = p_client_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_client_whatsapp_read(uuid) TO authenticated;
