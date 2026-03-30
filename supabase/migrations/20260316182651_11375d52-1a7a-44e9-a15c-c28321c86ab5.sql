
-- 1. Add user_id column to clients table for auth binding
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Create a function to get client IDs for the current user
CREATE OR REPLACE FUNCTION public.get_my_client_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(id), '{}')
  FROM public.clients
  WHERE user_id = auth.uid()
$$;

-- 3. Create a function to check if user is staff (not just cliente)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role != 'cliente'
  )
$$;

-- 4. Update clients RLS: clients can see their own record
DROP POLICY IF EXISTS "Staff can view clients" ON public.clients;
CREATE POLICY "Staff can view clients" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR user_id = auth.uid()
  );

-- 5. Equipments: clients can see their own equipments
DROP POLICY IF EXISTS "Staff can view equipments" ON public.equipments;
CREATE POLICY "Staff and clients can view equipments" ON public.equipments
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR client_id = ANY(public.get_my_client_ids())
  );

-- 6. Tickets: clients can see their own tickets
DROP POLICY IF EXISTS "Staff can view tickets" ON public.tickets;
CREATE POLICY "Staff and clients can view tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR client_id = ANY(public.get_my_client_ids())
  );

-- 7. Allow clients to insert tickets for themselves
DROP POLICY IF EXISTS "Staff can insert tickets" ON public.tickets;
CREATE POLICY "Staff and clients can insert tickets" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    OR client_id = ANY(public.get_my_client_ids())
  );

-- 8. Warranty claims: clients can see claims on their tickets
DROP POLICY IF EXISTS "Staff can view warranty claims" ON public.warranty_claims;
CREATE POLICY "Staff and clients can view warranty claims" ON public.warranty_claims
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR ticket_id IN (SELECT id FROM public.tickets WHERE client_id = ANY(public.get_my_client_ids()))
  );

-- 9. Service requests: clients can see their own
DROP POLICY IF EXISTS "Staff can view service requests" ON public.service_requests;
CREATE POLICY "Staff and clients can view service requests" ON public.service_requests
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR ticket_id IN (SELECT id FROM public.tickets WHERE client_id = ANY(public.get_my_client_ids()))
  );

-- 10. Work orders: clients can see their own
DROP POLICY IF EXISTS "Staff can view work orders" ON public.work_orders;
CREATE POLICY "Staff and clients can view work orders" ON public.work_orders
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR client_id = ANY(public.get_my_client_ids())
  );

-- 11. Maintenance plans: clients can see plans on their equipments
DROP POLICY IF EXISTS "Anyone can view maintenance plans" ON public.maintenance_plans;
CREATE POLICY "Staff and clients can view maintenance plans" ON public.maintenance_plans
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR equipment_id IN (SELECT id FROM public.equipments WHERE client_id = ANY(public.get_my_client_ids()))
  );

-- 12. Maintenance events: same pattern
DROP POLICY IF EXISTS "Anyone can view maintenance events" ON public.maintenance_events;
CREATE POLICY "Staff and clients can view maintenance events" ON public.maintenance_events
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR equipment_id IN (SELECT id FROM public.equipments WHERE client_id = ANY(public.get_my_client_ids()))
  );

-- 13. Create settings table for system configuration
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'geral',
  label text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER set_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default settings
INSERT INTO public.system_settings (key, value, category, label) VALUES
  ('company_name', '"Live Equipamentos"', 'geral', 'Nome da Empresa'),
  ('company_email', '"contato@liveequipamentos.com.br"', 'geral', 'Email Principal'),
  ('company_phone', '"(11) 0000-0000"', 'geral', 'Telefone'),
  ('default_margin', '30', 'precificacao', 'Margem Padrão (%)'),
  ('default_ipi', '5', 'precificacao', 'IPI Padrão (%)'),
  ('default_icms', '18', 'precificacao', 'ICMS Padrão (%)'),
  ('default_pis', '1.65', 'precificacao', 'PIS Padrão (%)'),
  ('default_cofins', '7.6', 'precificacao', 'COFINS Padrão (%)'),
  ('maintenance_alert_days', '30', 'manutencao', 'Dias de Antecedência para Alerta'),
  ('warranty_alert_days', '60', 'manutencao', 'Dias Antes do Vencimento da Garantia'),
  ('engineering_recurrence_threshold', '5', 'engenharia', 'Limite para Sinalizar Falha Crítica'),
  ('email_template_warranty_approved', '"Prezado cliente, sua solicitação de garantia foi aprovada."', 'templates', 'Template: Garantia Aprovada'),
  ('email_template_warranty_rejected', '"Prezado cliente, após análise técnica, a garantia não foi aprovada."', 'templates', 'Template: Garantia Reprovada'),
  ('email_template_maintenance_reminder', '"Olá. Identificamos que seu equipamento está próximo da revisão preventiva recomendada."', 'templates', 'Template: Lembrete de Manutenção')
ON CONFLICT (key) DO NOTHING;
