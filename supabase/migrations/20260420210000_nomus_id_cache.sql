
-- Tabela de cache de IDs Nomus para clientes e produtos
CREATE TABLE IF NOT EXISTS public.nomus_id_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('cliente', 'produto')),
  entity_key text NOT NULL,   -- nome do cliente ou código do produto
  nomus_id integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (entity_type, entity_key)
);

ALTER TABLE public.nomus_id_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read nomus cache" ON public.nomus_id_cache FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated can upsert nomus cache" ON public.nomus_id_cache FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated can update nomus cache" ON public.nomus_id_cache FOR UPDATE TO authenticated USING (true);

-- Função para buscar ID Nomus no cache
CREATE OR REPLACE FUNCTION public.nomus_get_cached_id(p_type text, p_key text)
RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$
  SELECT nomus_id FROM public.nomus_id_cache WHERE entity_type = p_type AND lower(entity_key) = lower(p_key) LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.nomus_get_cached_id(text, text) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.nomus_id_cache TO authenticated, service_role;
