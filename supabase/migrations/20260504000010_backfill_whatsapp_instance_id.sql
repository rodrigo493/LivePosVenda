-- Backfill: mensagens históricas sem instance_id assumem instância do token padrão (36084008/RODRIGO)
-- que era o número principal antes do multi-instância ser implementado (anterior a abril/27).
-- Token c6a355b6-c741-47c1-b1e6-c48938dd477b = número 36084008 = Letácia (pos-venda / assist. técnica)
UPDATE whatsapp_messages
SET instance_id = (
  SELECT id
  FROM pipeline_whatsapp_instances
  WHERE instance_token = 'c6a355b6-c741-47c1-b1e6-c48938dd477b'
    AND active = true
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE instance_id IS NULL;
