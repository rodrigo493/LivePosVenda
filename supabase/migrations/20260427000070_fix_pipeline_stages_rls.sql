-- Fix: pipeline_stages RLS blocks non-admin users from seeing stages
-- even after being granted pipeline_user_access via auto-grant on card assign/transfer.
-- The original policy required pipeline_stage_user_access (never auto-granted),
-- so usePipelineStages returned [] and the kanban showed no columns.
-- Fix: pipeline-level access is sufficient to see all stages in that pipeline.

DROP POLICY IF EXISTS "stages_select" ON public.pipeline_stages;
CREATE POLICY "stages_select" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_stage_user_access sua
      WHERE sua.stage_id = pipeline_stages.id AND sua.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.pipeline_user_access pua
      WHERE pua.pipeline_id = pipeline_stages.pipeline_id AND pua.user_id = auth.uid()
    )
  );

-- Backfill: grant pipeline_user_access for users already assigned to tickets
-- in pipelines where they have no access record yet.
INSERT INTO public.pipeline_user_access (user_id, pipeline_id)
SELECT DISTINCT t.assigned_to, t.pipeline_id
FROM public.tickets t
WHERE t.assigned_to IS NOT NULL
  AND t.pipeline_id IS NOT NULL
ON CONFLICT DO NOTHING;
