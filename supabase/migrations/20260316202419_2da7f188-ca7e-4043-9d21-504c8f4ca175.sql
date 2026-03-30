
-- Add missing column for stock unavailability
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS estoque_indisponivel boolean DEFAULT false;

-- Add unique constraint on code
ALTER TABLE public.products ADD CONSTRAINT products_code_unique UNIQUE (code);

-- Create indexes for fast search
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products (code);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products USING gin (to_tsvector('portuguese', name));
CREATE INDEX IF NOT EXISTS idx_products_product_group ON public.products (product_group);
CREATE INDEX IF NOT EXISTS idx_products_family ON public.products (family);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products (status);
