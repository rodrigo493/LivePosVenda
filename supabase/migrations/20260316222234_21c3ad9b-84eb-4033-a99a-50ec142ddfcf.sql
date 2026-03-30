-- Tasks table for CRM operational tasks
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  assigned_to uuid NOT NULL,
  due_date date,
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'pendente',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Add pipeline_stage and last_interaction_at to tickets
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'sem_atendimento',
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS estimated_value numeric DEFAULT 0;

-- Enable RLS on tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Staff can view tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR assigned_to = auth.uid());

CREATE POLICY "Staff can insert tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Staff can update tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (is_staff(auth.uid()) OR assigned_to = auth.uid());

CREATE POLICY "Staff can delete tasks" ON public.tasks
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR assigned_to = auth.uid());

-- Trigger to update updated_at on tasks
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing tickets with last_interaction_at
UPDATE public.tickets SET last_interaction_at = COALESCE(updated_at, now()) WHERE last_interaction_at IS NULL;