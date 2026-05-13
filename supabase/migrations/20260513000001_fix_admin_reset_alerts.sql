-- Corrige admin_reset_all_alerts: adiciona WHERE para evitar erro
-- "UPDATE requires a WHERE clause" do Supabase safe-writes protection
CREATE OR REPLACE FUNCTION admin_reset_all_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Permissão negada: somente administradores';
  END IF;

  UPDATE profiles
  SET unanswered_ack_at = now(),
      overdue_ack_at    = now()
  WHERE user_id IS NOT NULL;

  UPDATE tickets SET new_lead = false WHERE new_lead = true;

  UPDATE clients SET whatsapp_last_read_at = now()
  WHERE id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_all_alerts() TO authenticated;
