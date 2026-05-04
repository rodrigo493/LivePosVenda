-- Adiciona colunas de ack de alertas à tabela profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS unanswered_ack_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overdue_ack_at    TIMESTAMPTZ;

-- ── RESET IMEDIATO ─────────────────────────────────────────────────────────
-- Zera todos os alertas agora para todos os usuários.
-- A partir daqui cada usuário só verá alertas gerados após este momento.

UPDATE profiles
SET unanswered_ack_at = now(),
    overdue_ack_at    = now();

UPDATE clients
SET whatsapp_last_read_at = now();

UPDATE tickets
SET new_lead = false
WHERE new_lead = true;

-- ── RPC: reset_my_alerts ───────────────────────────────────────────────────
-- Zera apenas os alertas do próprio usuário autenticado.
CREATE OR REPLACE FUNCTION reset_my_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_inst_id   UUID;
BEGIN
  -- 1. Atualiza timestamps de ack do perfil
  UPDATE profiles
  SET unanswered_ack_at = now(),
      overdue_ack_at    = now()
  WHERE id = v_user_id;

  -- 2. Zera new_lead dos tickets atribuídos a este usuário
  UPDATE tickets
  SET new_lead = false
  WHERE new_lead = true
    AND assigned_to = v_user_id;

  -- 3. Marca como lidas as mensagens WhatsApp da instância deste usuário
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
    -- Fallback: clientes atribuídos ao usuário
    UPDATE clients
    SET whatsapp_last_read_at = now()
    WHERE assigned_to = v_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION reset_my_alerts() TO authenticated;

-- ── RPC: admin_reset_all_alerts ────────────────────────────────────────────
-- Zera alertas de TODOS os usuários (somente admin).
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
      overdue_ack_at    = now();

  UPDATE tickets SET new_lead = false WHERE new_lead = true;

  UPDATE clients SET whatsapp_last_read_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reset_all_alerts() TO authenticated;
