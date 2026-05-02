-- Funil de Vendas com etapas padrão
INSERT INTO public.pipelines (name, slug, position, is_active)
VALUES ('Vendas', 'vendas', 1, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, position, delay_minutes)
SELECT p.id, 'lead_novo',      'Lead novo',          'hsl(262 83% 58%)',  0, 1
FROM public.pipelines p WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, key) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, position, delay_minutes)
SELECT p.id, 'contato',        'Contato',            'hsl(221 83% 58%)',  1, 2
FROM public.pipelines p WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, key) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, position, delay_minutes)
SELECT p.id, 'proposta',       'Proposta enviada',   'hsl(32 95% 55%)',   2, 5
FROM public.pipelines p WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, key) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, position, delay_minutes)
SELECT p.id, 'negociacao',     'Negociação',         'hsl(10 83% 58%)',   3, 7
FROM public.pipelines p WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, key) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, position, delay_minutes)
SELECT p.id, 'fechado_ganho',  'Fechado (Ganho)',    'hsl(142 76% 36%)', 4, 999
FROM public.pipelines p WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, key) DO NOTHING;

INSERT INTO public.pipeline_stages (pipeline_id, key, label, color, position, delay_minutes)
SELECT p.id, 'fechado_perdido','Fechado (Perdido)',  'hsl(0 0% 45%)',     5, 999
FROM public.pipelines p WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, key) DO NOTHING;

-- Fontes padrão para o funil de Vendas
INSERT INTO public.pipeline_lead_sources (pipeline_id, name, color, active)
SELECT p.id, fonte.name, fonte.color, true
FROM public.pipelines p,
  (VALUES
    ('Site',       '#6366f1'),
    ('Meta Ads',   '#1877F2'),
    ('Google Ads', '#EA4335'),
    ('Instagram',  '#E1306C'),
    ('TikTok',     '#010101'),
    ('LinkedIn',   '#0A66C2'),
    ('Indicação',  '#F59E0B'),
    ('Orgânico',   '#10B981')
  ) AS fonte(name, color)
WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, name) DO NOTHING;
