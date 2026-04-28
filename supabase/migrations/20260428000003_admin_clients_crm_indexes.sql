-- Indexes for admin CRM features (follow-up to 20260428000002)

-- Index on clients.assigned_to (used in admin responsible-user filter)
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON public.clients(assigned_to);

-- Partial index on tickets.deleted_at (universal predicate in all ticket queries)
CREATE INDEX IF NOT EXISTS idx_tickets_not_deleted ON public.tickets(id) WHERE deleted_at IS NULL;

-- Index on tickets.is_paused (used in kanban filter for non-admin users)
CREATE INDEX IF NOT EXISTS idx_tickets_is_paused ON public.tickets(is_paused) WHERE is_paused = false;
