-- supabase/migrations/20260427000001_multi_pipeline.sql

-- 1. Tabela de funis
CREATE TABLE public.pipelines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  position   INT  NOT NULL DEFAULT 0,
  is_active  BOOL NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

-- 2. Etapas de cada funil
CREATE TABLE public.pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE RESTRICT,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'hsl(0 0% 45%)',
  delay_days  INT  NOT NULL DEFAULT 3,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(pipeline_id, key)
);
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

-- 3. Acesso de usuários aos funis
CREATE TABLE public.pipeline_user_access (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pipeline_id)
);
ALTER TABLE public.pipeline_user_access ENABLE ROW LEVEL SECURITY;

-- 4. Acesso de usuários às etapas
CREATE TABLE public.pipeline_stage_user_access (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, stage_id)
);
ALTER TABLE public.pipeline_stage_user_access ENABLE ROW LEVEL SECURITY;

-- 5. Policies (criadas após todas as tabelas existirem)

-- pipelines policies
CREATE POLICY "pipelines_select" ON public.pipelines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_user_access pua
      WHERE pua.pipeline_id = id AND pua.user_id = auth.uid()
    )
  );
CREATE POLICY "pipelines_admin_write" ON public.pipelines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- pipeline_stages policies
CREATE POLICY "stages_select" ON public.pipeline_stages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.pipeline_stage_user_access sua
      WHERE sua.stage_id = id AND sua.user_id = auth.uid()
    )
  );
CREATE POLICY "stages_admin_write" ON public.pipeline_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- pipeline_user_access policies
CREATE POLICY "pua_select" ON public.pipeline_user_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "pua_admin_write" ON public.pipeline_user_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- pipeline_stage_user_access policies
CREATE POLICY "psua_select" ON public.pipeline_stage_user_access FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "psua_admin_write" ON public.pipeline_stage_user_access FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Adiciona pipeline_id em tickets
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS pipeline_id UUID REFERENCES public.pipelines(id);

-- 7. Seed: funil padrão "Pós-Venda" e etapas
DO $$
DECLARE
  v_pipeline_id UUID;
  v_color TEXT;
  v_delay INT;
BEGIN
  INSERT INTO public.pipelines (name, slug, position)
  VALUES ('Pós-Venda', 'pos-venda', 0)
  RETURNING id INTO v_pipeline_id;

  -- sem_atendimento
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'pipeline_color_sem_atendimento' LIMIT 1),
    'hsl(0 0% 45%)'
  ) INTO v_color;
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = 'pipeline_delay_sem_atendimento' LIMIT 1),
    1
  ) INTO v_delay;
  INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
  VALUES (v_pipeline_id, 'sem_atendimento', 'Sem atendimento', v_color, v_delay, 0);

  -- primeiro_contato
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'pipeline_color_primeiro_contato' LIMIT 1),
    'hsl(210 80% 55%)'
  ) INTO v_color;
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = 'pipeline_delay_primeiro_contato' LIMIT 1),
    2
  ) INTO v_delay;
  INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
  VALUES (v_pipeline_id, 'primeiro_contato', 'Primeiro contato', v_color, v_delay, 1);

  -- em_analise
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'pipeline_color_em_analise' LIMIT 1),
    'hsl(38 92% 50%)'
  ) INTO v_color;
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = 'pipeline_delay_em_analise' LIMIT 1),
    3
  ) INTO v_delay;
  INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
  VALUES (v_pipeline_id, 'em_analise', 'Em análise', v_color, v_delay, 2);

  -- separacao_pecas
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'pipeline_color_separacao_pecas' LIMIT 1),
    'hsl(280 60% 55%)'
  ) INTO v_color;
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = 'pipeline_delay_separacao_pecas' LIMIT 1),
    5
  ) INTO v_delay;
  INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
  VALUES (v_pipeline_id, 'separacao_pecas', 'Separação de peças', v_color, v_delay, 3);

  -- concluido
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'pipeline_color_concluido' LIMIT 1),
    'hsl(142 71% 45%)'
  ) INTO v_color;
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = 'pipeline_delay_concluido' LIMIT 1),
    999
  ) INTO v_delay;
  INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
  VALUES (v_pipeline_id, 'concluido', 'Concluído', v_color, v_delay, 4);

  -- sem_interacao
  SELECT COALESCE(
    (SELECT value #>> '{}' FROM public.system_settings WHERE key = 'pipeline_color_sem_interacao' LIMIT 1),
    'hsl(0 84% 60%)'
  ) INTO v_color;
  SELECT COALESCE(
    (SELECT (value #>> '{}')::integer FROM public.system_settings WHERE key = 'pipeline_delay_sem_interacao' LIMIT 1),
    2
  ) INTO v_delay;
  INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, delay_days, position)
  VALUES (v_pipeline_id, 'sem_interacao', 'Sem interação', v_color, v_delay, 5);

  -- Backfill tickets
  UPDATE public.tickets SET pipeline_id = v_pipeline_id WHERE pipeline_id IS NULL;

  -- Liberar acesso ao funil Pós-Venda para todos usuários não-admin existentes
  INSERT INTO public.pipeline_user_access (user_id, pipeline_id)
  SELECT DISTINCT ur.user_id, v_pipeline_id
  FROM public.user_roles ur
  WHERE ur.role != 'admin'
  ON CONFLICT DO NOTHING;

  -- Liberar acesso a todas as etapas para esses usuários
  INSERT INTO public.pipeline_stage_user_access (user_id, stage_id)
  SELECT pua.user_id, ps.id
  FROM public.pipeline_user_access pua
  CROSS JOIN public.pipeline_stages ps
  WHERE ps.pipeline_id = v_pipeline_id
    AND pua.pipeline_id = v_pipeline_id
  ON CONFLICT DO NOTHING;

END $$;

-- 8. Torna pipeline_id NOT NULL após backfill
ALTER TABLE public.tickets ALTER COLUMN pipeline_id SET NOT NULL;
