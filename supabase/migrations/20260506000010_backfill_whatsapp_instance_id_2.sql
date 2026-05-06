-- Segundo backfill: mensagens que ainda chegaram com instance_id NULL após o primeiro backfill
-- (webhook com token legacy que não encontrava a instância no banco).
-- Atribui à instância mais antiga ativa (pós-venda/RODRIGO, token c6a355b6-...).
UPDATE whatsapp_messages
SET instance_id = (
  SELECT id
  FROM pipeline_whatsapp_instances
  WHERE active = true
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE instance_id IS NULL;
