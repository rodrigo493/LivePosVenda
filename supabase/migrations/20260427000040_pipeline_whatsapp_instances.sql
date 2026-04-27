-- Multi-instance WhatsApp per pipeline
-- Each pipeline can have N Uazapi instances (phone numbers)
-- with weighted distribution for new outbound conversations.

CREATE TABLE public.pipeline_whatsapp_instances (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id          UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  instance_name        TEXT        NOT NULL,                    -- display name, e.g. "Vendas #1"
  phone_number         TEXT,                                    -- display phone, e.g. "48996068686"
  uazapi_instance_name TEXT        NOT NULL,                    -- instanceName from Uazapi payload (e.g. "RODRIGO")
  instance_token       TEXT        NOT NULL,                    -- Uazapi instance token
  base_url             TEXT        NOT NULL DEFAULT 'https://liveuni.uazapi.com',
  distribution_pct     INTEGER     NOT NULL DEFAULT 0,
  active               BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT distribution_pct_range CHECK (distribution_pct >= 0 AND distribution_pct <= 100)
);

CREATE INDEX idx_pwi_pipeline ON public.pipeline_whatsapp_instances (pipeline_id);
CREATE INDEX idx_pwi_token    ON public.pipeline_whatsapp_instances (instance_token);
CREATE UNIQUE INDEX idx_pwi_uazapi_name ON public.pipeline_whatsapp_instances (uazapi_instance_name);

ALTER TABLE public.pipeline_whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed by Edge Functions and frontend)
CREATE POLICY "authenticated_read" ON public.pipeline_whatsapp_instances
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admin can write
CREATE POLICY "admin_write" ON public.pipeline_whatsapp_instances
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add instance_id to whatsapp_messages so we know which number handled each message
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.pipeline_whatsapp_instances(id);

-- Seed: register the current pós-vendas instance (instanceName = "RODRIGO")
INSERT INTO public.pipeline_whatsapp_instances
  (pipeline_id, instance_name, phone_number, uazapi_instance_name, instance_token, distribution_pct, active)
SELECT
  p.id,
  'Pós-Vendas',
  NULL,
  'RODRIGO',
  'c6a355b6-c741-47c1-b1e6-c48938dd477b',
  100,
  true
FROM public.pipelines p
WHERE p.slug = 'pos-venda'
LIMIT 1
ON CONFLICT (uazapi_instance_name) DO NOTHING;
