-- =============================================================================
-- pg_cron: Executar agente Pós-Venda a cada 10 minutos
--
-- PRÉ-REQUISITO — adicione o segredo no Supabase Vault ANTES de aplicar:
--   Dashboard → Settings → Vault → New Secret
--     name:  service_role_key
--     value: <Service Role Key do projeto ehqkggiuouczmafmlzls>
--
-- Para verificar se está configurado:
--   SELECT name FROM vault.decrypted_secrets WHERE name = 'service_role_key';
-- =============================================================================

-- Remove job anterior se existir (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'posvenda-agent-10min') THEN
    PERFORM cron.unschedule('posvenda-agent-10min');
  END IF;
END;
$$;

SELECT cron.schedule(
  'posvenda-agent-10min',
  '*/10 * * * *',
  $$
  SELECT
    net.http_post(
      url     := 'https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/posvenda-agent-executor',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || COALESCE(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          ''
        )
      ),
      body    := '{}'::jsonb
    ) AS request_id;
  $$
);
