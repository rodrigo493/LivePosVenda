-- Squad notification audit columns for PA (service_requests) and PG (warranty_claims)
-- Why: record whether the approval was successfully forwarded to the Squad pós-venda flow,
-- so failures are observable and re-sendable instead of silently swallowed on the client.

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS squad_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS squad_response_status integer,
  ADD COLUMN IF NOT EXISTS squad_error text;

ALTER TABLE public.warranty_claims
  ADD COLUMN IF NOT EXISTS squad_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS squad_response_status integer,
  ADD COLUMN IF NOT EXISTS squad_error text;
