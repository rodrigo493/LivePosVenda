
-- Fix existing service_requests: generate PA numbers from their ticket's quote
UPDATE service_requests sr
SET request_number = 'PA-' || SUBSTRING(q.quote_number FROM 4)
FROM quotes q
WHERE q.ticket_id = sr.ticket_id
  AND q.status = 'aprovado'
  AND sr.request_number IS NULL
  AND sr.notes = 'Gerado a partir de orçamento aprovado'
  AND q.service_request_id IS NULL;

-- Fix existing warranty_claims: generate PG numbers from their ticket's quote  
UPDATE warranty_claims wc
SET claim_number = 'PG-' || SUBSTRING(q.quote_number FROM 4)
FROM quotes q
WHERE q.ticket_id = wc.ticket_id
  AND q.status = 'aprovado'
  AND wc.claim_number IS NULL
  AND wc.defect_description = 'Gerado a partir de orçamento aprovado'
  AND q.warranty_claim_id IS NULL;
