-- Declare FK constraints from quotes to service_requests / warranty_claims so
-- that PostgREST can resolve `quotes(service_requests(...))` joins. Without
-- these, the embed returns PGRST200 "Could not find a relationship".
-- Why: TicketDetailDialog joins quotes with PA/PG numbers in the same query.
-- ON DELETE SET NULL: deleting a PA/PG should leave the quote intact.

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_service_request_id_fkey
  FOREIGN KEY (service_request_id)
  REFERENCES public.service_requests(id)
  ON DELETE SET NULL;

ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_warranty_claim_id_fkey
  FOREIGN KEY (warranty_claim_id)
  REFERENCES public.warranty_claims(id)
  ON DELETE SET NULL;

-- Refresh PostgREST schema cache so the new relationships are visible.
NOTIFY pgrst, 'reload schema';
