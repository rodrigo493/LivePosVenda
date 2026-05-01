-- Token único por config para autenticar chamadas do pg_cron → edge function
ALTER TABLE public.rd_integration_config
  ADD COLUMN IF NOT EXISTS worker_token UUID DEFAULT gen_random_uuid();

UPDATE public.rd_integration_config
  SET worker_token = gen_random_uuid()
  WHERE worker_token IS NULL;

-- Função chamada pelo pg_cron: aciona o worker via HTTP se houver import em andamento
CREATE OR REPLACE FUNCTION public.trigger_rd_import_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_row record;
BEGIN
  SELECT * INTO config_row
  FROM rd_integration_config
  WHERE is_active = true
    AND (import_stats->>'status') = 'running'
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := 'https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/rd-import',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-worker-token', config_row.worker_token::text
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Remove job anterior se existir, para evitar duplicatas
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rd-import-worker') THEN
    PERFORM cron.unschedule('rd-import-worker');
  END IF;
END $$;

-- Agenda: a cada minuto (limite do cron padrão)
SELECT cron.schedule(
  'rd-import-worker',
  '* * * * *',
  'SELECT public.trigger_rd_import_worker()'
);
