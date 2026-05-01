-- Campo para configurar o número que recebe o relatório diário de cards sem resposta
ALTER TABLE public.rd_integration_config
  ADD COLUMN IF NOT EXISTS notification_phone TEXT;

-- Função chamada pelo pg_cron: aciona o relatório diário via HTTP
CREATE OR REPLACE FUNCTION public.trigger_daily_unanswered_report()
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
    AND notification_phone IS NOT NULL
    AND notification_phone <> ''
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  PERFORM net.http_post(
    url     := 'https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/daily-unanswered-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-worker-token', config_row.worker_token::text
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Remove job anterior se existir
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-unanswered-report') THEN
    PERFORM cron.unschedule('daily-unanswered-report');
  END IF;
END $$;

-- Seg–sex às 11:00 UTC (08:00 BRT / 08:00 Horário de Brasília)
SELECT cron.schedule(
  'daily-unanswered-report',
  '0 11 * * 1-5',
  'SELECT public.trigger_daily_unanswered_report()'
);
