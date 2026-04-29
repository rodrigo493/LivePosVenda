-- Adiciona campo "Observações Squad" em PA e PG
-- Texto livre que é exibido e editável no detalhe do card,
-- preenchido opcionalmente na criação, e enviado no payload Squad.

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS squad_notes text;

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS squad_notes text;
