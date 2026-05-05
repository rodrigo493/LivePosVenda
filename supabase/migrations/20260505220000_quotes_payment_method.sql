-- Adiciona forma de pagamento e parcelas à tabela quotes
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix',
  ADD COLUMN IF NOT EXISTS installments SMALLINT DEFAULT 1;
