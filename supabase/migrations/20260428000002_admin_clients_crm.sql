-- 1.1 Responsável do cliente
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1.2 Flag de pausa do card
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false;

-- 1.3 Soft delete do card
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
