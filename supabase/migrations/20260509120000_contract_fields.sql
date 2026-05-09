-- Contract data fields for PD (Pedido de Venda)
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS contract_bairro TEXT,
  ADD COLUMN IF NOT EXISTS contract_installments JSONB DEFAULT '[]';
-- contract_installments shape: [{parcela:1, data:"24.10.2025", valor:"R$ 9.102,50", forma:"Bolepix"}]
