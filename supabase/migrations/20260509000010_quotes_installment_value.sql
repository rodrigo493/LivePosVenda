ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS installment_value TEXT;
