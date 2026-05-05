-- Adiciona forma de pagamento e parcelas ao orçamento
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_method TEXT,         -- 'pix' | 'transferencia' | 'cartao_parcelado'
  ADD COLUMN IF NOT EXISTS installments   INTEGER;      -- qtd de parcelas (somente para cartao_parcelado)
