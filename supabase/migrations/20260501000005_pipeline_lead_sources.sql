-- Fontes de leads por funil
-- Cada funil pode ter N fontes (Site, Meta, Google, LinkedIn, etc.)
CREATE TABLE public.pipeline_lead_sources (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID        NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#6366f1',
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_lead_sources_pipeline_name_unique UNIQUE (pipeline_id, name)
);

CREATE INDEX idx_pls_pipeline ON public.pipeline_lead_sources (pipeline_id);

ALTER TABLE public.pipeline_lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON public.pipeline_lead_sources
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "admin_write" ON public.pipeline_lead_sources
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Coluna source nas tickets para rastrear a origem do lead
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS lead_source_id UUID REFERENCES public.pipeline_lead_sources(id) ON DELETE SET NULL;
