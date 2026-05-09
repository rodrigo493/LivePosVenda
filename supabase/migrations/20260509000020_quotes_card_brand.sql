ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS card_brand TEXT;
