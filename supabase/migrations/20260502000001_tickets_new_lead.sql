-- Flag para tickets criados via formulário do site (nova entrada de lead)
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS new_lead BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tickets_new_lead ON public.tickets (new_lead) WHERE new_lead = true;
