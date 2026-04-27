-- Pipeline stage automations: rules triggered when a card enters a stage.
-- Execution engine is future work — this migration only creates the schema.

CREATE TABLE public.pipeline_stage_automations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id      UUID        NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  trigger_type  TEXT        NOT NULL DEFAULT 'card_enter_stage',
  action_type   TEXT        NOT NULL,
  action_config JSONB       NOT NULL DEFAULT '{}',
  position      INT         NOT NULL DEFAULT 0,
  is_active     BOOL        NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pipeline_stage_automations ENABLE ROW LEVEL SECURITY;

-- Admins can do everything; staff can only read
CREATE POLICY "psa_admin_all" ON public.pipeline_stage_automations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "psa_staff_select" ON public.pipeline_stage_automations
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX idx_psa_stage_id ON public.pipeline_stage_automations(stage_id);
