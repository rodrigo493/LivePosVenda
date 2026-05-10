-- Permite que qualquer usuário staff veja as etapas dos funis.
-- A policy anterior só permitia admin ou usuários com pipeline_user_access/stage_user_access,
-- causando lista de etapas vazia no sidebar WhatsApp para usuários sem acesso explícito.

DROP POLICY IF EXISTS "stages_select" ON public.pipeline_stages;
CREATE POLICY "stages_select" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pipeline_stage_user_access sua
      WHERE sua.stage_id = pipeline_stages.id AND sua.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.pipeline_user_access pua
      WHERE pua.pipeline_id = pipeline_stages.pipeline_id AND pua.user_id = auth.uid()
    )
  );
