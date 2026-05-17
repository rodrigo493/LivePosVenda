-- Coluna has_studio: indica se o lead da LP Combo Studio Live Classic já possui
-- um studio de Pilates. Preenchida pela edge function lp-studio-lead.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS has_studio boolean;

-- Backfill dos cards já criados pela LP, a partir do sufixo do título
-- ("{nome} · Tem studio" / "{nome} · Sem studio").
UPDATE public.tickets
  SET has_studio = true
  WHERE channel = 'lp_combo_classic'
    AND has_studio IS NULL
    AND title ILIKE '%tem studio%';

UPDATE public.tickets
  SET has_studio = false
  WHERE channel = 'lp_combo_classic'
    AND has_studio IS NULL
    AND title ILIKE '%sem studio%';
