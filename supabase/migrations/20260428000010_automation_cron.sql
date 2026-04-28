-- pg_cron: Executar automações de etapa a cada minuto
-- PRÉ-REQUISITO: vault.decrypted_secrets deve ter 'service_role_key' configurado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'execute-stage-automations') THEN
    PERFORM cron.unschedule('execute-stage-automations');
  END IF;
END;
$$;

SELECT cron.schedule(
  'execute-stage-automations',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url     := 'https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/execute-automations',
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
