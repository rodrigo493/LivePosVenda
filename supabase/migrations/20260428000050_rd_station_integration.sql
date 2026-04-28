-- supabase/migrations/20260428000050_rd_station_integration.sql

-- Colunas de vínculo nas tabelas existentes
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS rd_deal_id TEXT UNIQUE;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rd_contact_id TEXT UNIQUE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ticket_comments') THEN
    ALTER TABLE public.ticket_comments
      ADD COLUMN IF NOT EXISTS rd_activity_id TEXT UNIQUE;
  END IF;
END;
$$;

-- Configuração da integração (1 linha por tenant)
CREATE TABLE IF NOT EXISTS public.rd_integration_config (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_token        TEXT        NOT NULL,
  pipeline_name    TEXT        NOT NULL DEFAULT 'Funil de Vendas',
  rd_pipeline_id   TEXT,
  webhook_secret   TEXT        DEFAULT (replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '')),
  is_active        BOOLEAN     NOT NULL DEFAULT false,
  last_import_at   TIMESTAMPTZ,
  last_webhook_at  TIMESTAMPTZ,
  import_stats     JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Log de operações
CREATE TABLE IF NOT EXISTS public.rd_sync_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation     TEXT        NOT NULL,
  event_type    TEXT,
  rd_id         TEXT,
  live_id       UUID,
  status        TEXT        NOT NULL,
  error_message TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.rd_integration_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rd_sync_log           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rdi_admin_only" ON public.rd_integration_config
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "rdl_admin_only" ON public.rd_sync_log
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger de updated_at em rd_integration_config
CREATE OR REPLACE FUNCTION public.set_rd_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_rd_config_updated_at
  BEFORE UPDATE ON public.rd_integration_config
  FOR EACH ROW EXECUTE FUNCTION public.set_rd_config_updated_at();
