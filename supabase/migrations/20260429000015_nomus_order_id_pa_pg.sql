-- Armazena o ID do pedido criado no ERP Nomus para permitir atualizações posteriores
ALTER TABLE public.service_requests  ADD COLUMN IF NOT EXISTS nomus_order_id integer;
ALTER TABLE public.warranty_claims   ADD COLUMN IF NOT EXISTS nomus_order_id integer;
