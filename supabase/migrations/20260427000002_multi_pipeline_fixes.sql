-- Migration: multi_pipeline_fixes
-- Fix issues found in code review of 20260427000001_multi_pipeline.sql
-- Applied AFTER the original migration (which is already in Supabase)

-- =============================================================================
-- Critical #1: Default pipeline_id on tickets to the 'pos-venda' pipeline
-- PostgreSQL does NOT allow subqueries in DEFAULT expressions, so we use a
-- BEFORE INSERT trigger that fills in the value when the column is NULL.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_default_pipeline_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pipeline_id IS NULL THEN
    SELECT id INTO NEW.pipeline_id
    FROM public.pipelines
    WHERE slug = 'pos-venda'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_default_pipeline ON public.tickets;
CREATE TRIGGER trg_tickets_default_pipeline
  BEFORE INSERT ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_default_pipeline_id();

-- =============================================================================
-- Critical #2: Fix unqualified `id` in RLS policies (ambiguous column reference)
-- Recreate both policies with fully-qualified column references
-- =============================================================================

DROP POLICY IF EXISTS "pipelines_select" ON public.pipelines;
CREATE POLICY "pipelines_select" ON public.pipelines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_user_access pua
      WHERE pua.pipeline_id = pipelines.id AND pua.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "stages_select" ON public.pipeline_stages;
CREATE POLICY "stages_select" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_stage_user_access sua
      WHERE sua.stage_id = pipeline_stages.id AND sua.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Important #3: Add missing performance indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_pipeline_id
  ON public.tickets(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id
  ON public.pipeline_stages(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_pua_pipeline_id
  ON public.pipeline_user_access(pipeline_id);

CREATE INDEX IF NOT EXISTS idx_psua_stage_id
  ON public.pipeline_stage_user_access(stage_id);

-- =============================================================================
-- Minor #4: Add CHECK constraint to prevent negative delay_days
-- =============================================================================
ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT chk_delay_days CHECK (delay_days >= 0);
