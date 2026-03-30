
-- Fix double dash in request_number
UPDATE service_requests
SET request_number = REPLACE(request_number, 'PA--', 'PA-')
WHERE request_number LIKE 'PA--%';

-- Fix double dash in claim_number
UPDATE warranty_claims
SET claim_number = REPLACE(claim_number, 'PG--', 'PG-')
WHERE claim_number LIKE 'PG--%';
