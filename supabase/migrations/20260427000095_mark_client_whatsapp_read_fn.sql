-- Creates a SECURITY DEFINER function so any authenticated user can mark
-- a WhatsApp conversation as read, bypassing the restrictive clients UPDATE RLS.
-- The policy only allows admin or created_by to UPDATE clients, but marking a
-- conversation as read should be allowed for any staff member.

CREATE OR REPLACE FUNCTION public.mark_client_whatsapp_read(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
  SET whatsapp_last_read_at = now()
  WHERE id = p_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_client_whatsapp_read(uuid) TO authenticated;
