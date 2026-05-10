-- Permite que qualquer usuário staff veja todos os funis e etapas.
-- Necessário para a extensão WhatsApp: usuários novos não têm pipeline_user_access
-- e o dropdown de funis ficava vazio, impedindo a criação de cards.

DROP POLICY IF EXISTS "pipelines_select" ON public.pipelines;
CREATE POLICY "pipelines_select" ON public.pipelines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_staff(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.pipeline_user_access pua
      WHERE pua.pipeline_id = pipelines.id AND pua.user_id = auth.uid()
    )
  );
