-- Adiciona suporte a múltiplas formas de pagamento no orçamento
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_methods TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS payment_compra_programada_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_financiamento_notes TEXT;
