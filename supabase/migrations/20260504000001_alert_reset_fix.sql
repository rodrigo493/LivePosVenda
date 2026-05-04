-- Corrige reset_my_alerts: profiles usa user_id, não id
CREATE OR REPLACE FUNCTION reset_my_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_inst_id UUID;
BEGIN
  UPDATE profiles
  SET unanswered_ack_at = now(),
      overdue_ack_at    = now()
  WHERE user_id = v_user_id;

  UPDATE tickets
  SET new_lead = false
  WHERE new_lead = true
    AND assigned_to = v_user_id;

  SELECT id INTO v_inst_id
  FROM pipeline_whatsapp_instances
  WHERE user_id = v_user_id
    AND active  = true
  LIMIT 1;

  IF v_inst_id IS NOT NULL THEN
    UPDATE clients c
    SET whatsapp_last_read_at = now()
    FROM (
      SELECT DISTINCT client_id
      FROM whatsapp_messages
      WHERE instance_id = v_inst_id
    ) m
    WHERE c.id = m.client_id;
  ELSE
    UPDATE clients
    SET whatsapp_last_read_at = now()
    WHERE assigned_to = v_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_my_alerts() TO authenticated;

-- Re-executa o reset agora com a coluna correta
UPDATE profiles
SET unanswered_ack_at = now(),
    overdue_ack_at    = now();

UPDATE clients SET whatsapp_last_read_at = now();
UPDATE tickets SET new_lead = false WHERE new_lead = true;
