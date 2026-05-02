-- Fontes específicas dos formulários do site
INSERT INTO public.pipeline_lead_sources (pipeline_id, name, color, active)
SELECT p.id, fonte.name, fonte.color, true
FROM public.pipelines p,
  (VALUES
    ('Formulário Site Landing Page', '#6366f1'),
    ('Formulário Site WhatsApp',     '#25D366')
  ) AS fonte(name, color)
WHERE p.slug = 'vendas'
ON CONFLICT (pipeline_id, name) DO NOTHING;
