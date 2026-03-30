
-- =============================================
-- LIVE CARE - DATABASE SCHEMA
-- =============================================

-- 1. ENUM TYPES
CREATE TYPE public.app_role AS ENUM ('admin', 'atendimento', 'tecnico', 'engenharia', 'financeiro', 'cliente');
CREATE TYPE public.ticket_status AS ENUM ('aberto', 'em_analise', 'aguardando_informacoes', 'aguardando_peca', 'agendado', 'em_atendimento', 'aprovado', 'reprovado', 'resolvido', 'fechado');
CREATE TYPE public.ticket_type_enum AS ENUM ('chamado_tecnico', 'garantia', 'assistencia');
CREATE TYPE public.warranty_status AS ENUM ('em_analise', 'aprovada', 'reprovada', 'convertida_os');
CREATE TYPE public.work_order_type AS ENUM ('garantia', 'pos_venda', 'preventiva', 'assistencia');
CREATE TYPE public.work_order_status AS ENUM ('aberta', 'agendada', 'em_andamento', 'concluida', 'cancelada');
CREATE TYPE public.work_order_item_type AS ENUM ('garantia', 'cobranca');
CREATE TYPE public.service_request_type AS ENUM ('corretiva', 'preventiva', 'inspecao', 'troca_peca', 'suporte');
CREATE TYPE public.service_request_status AS ENUM ('aberto', 'orcamento_enviado', 'agendado', 'em_andamento', 'resolvido', 'cancelado');

-- 2. UTILITY FUNCTIONS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. USER ROLES TABLE
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(role), '{}')
  FROM public.user_roles
  WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 5. CLIENTS TABLE
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  document TEXT,
  document_type TEXT DEFAULT 'cpf',
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  contact_person TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. EQUIPMENT MODELS TABLE
CREATE TABLE public.equipment_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  warranty_months INTEGER DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipment_models ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_equipment_models_updated_at BEFORE UPDATE ON public.equipment_models FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. EQUIPMENTS TABLE
CREATE TABLE public.equipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES public.equipment_models(id),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  serial_number TEXT NOT NULL UNIQUE,
  batch_number TEXT,
  manufacture_date DATE,
  sale_date DATE,
  installation_date DATE,
  warranty_expires_at DATE,
  warranty_status TEXT NOT NULL DEFAULT 'em_garantia',
  status TEXT NOT NULL DEFAULT 'ativo',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.equipments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_equipments_updated_at BEFORE UPDATE ON public.equipments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_equipments_serial ON public.equipments(serial_number);
CREATE INDEX idx_equipments_client ON public.equipments(client_id);

-- 8. TICKETS TABLE
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT NOT NULL UNIQUE,
  ticket_type ticket_type_enum NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  equipment_id UUID NOT NULL REFERENCES public.equipments(id),
  title TEXT NOT NULL,
  description TEXT,
  problem_category TEXT,
  priority TEXT NOT NULL DEFAULT 'media',
  status ticket_status NOT NULL DEFAULT 'aberto',
  assigned_to UUID REFERENCES auth.users(id),
  internal_notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_tickets_client ON public.tickets(client_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  seq_num INTEGER;
BEGIN
  CASE NEW.ticket_type
    WHEN 'chamado_tecnico' THEN prefix := 'CH';
    WHEN 'garantia' THEN prefix := 'GT';
    WHEN 'assistencia' THEN prefix := 'AS';
  END CASE;
  SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_number FROM 4) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.tickets
  WHERE ticket_type = NEW.ticket_type;
  NEW.ticket_number := prefix || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER generate_ticket_number_trigger
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  WHEN (NEW.ticket_number IS NULL OR NEW.ticket_number = '')
  EXECUTE FUNCTION public.generate_ticket_number();

-- 9. WARRANTY CLAIMS TABLE
CREATE TABLE public.warranty_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  purchase_date DATE,
  installation_date DATE,
  warranty_period_months INTEGER,
  warranty_status warranty_status NOT NULL DEFAULT 'em_analise',
  defect_description TEXT,
  technical_analysis TEXT,
  final_verdict TEXT,
  approval_reason TEXT,
  rejection_reason TEXT,
  covered_parts TEXT,
  covered_labor BOOLEAN DEFAULT false,
  internal_cost NUMERIC(12,2) DEFAULT 0,
  work_order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_warranty_claims_updated_at BEFORE UPDATE ON public.warranty_claims FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. SERVICE REQUESTS TABLE
CREATE TABLE public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  request_type service_request_type NOT NULL DEFAULT 'corretiva',
  status service_request_status NOT NULL DEFAULT 'aberto',
  estimated_cost NUMERIC(12,2),
  approved_by_client BOOLEAN DEFAULT false,
  work_order_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_service_requests_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. PRODUCTS TABLE
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  compatibility TEXT,
  useful_life_months INTEGER,
  unit TEXT DEFAULT 'un',
  base_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ipi_percent NUMERIC(5,2) DEFAULT 0,
  icms_percent NUMERIC(5,2) DEFAULT 0,
  pis_percent NUMERIC(5,2) DEFAULT 0,
  cofins_percent NUMERIC(5,2) DEFAULT 0,
  csll_percent NUMERIC(5,2) DEFAULT 0,
  irpj_percent NUMERIC(5,2) DEFAULT 0,
  margin_percent NUMERIC(5,2) DEFAULT 30,
  supplier TEXT,
  status TEXT NOT NULL DEFAULT 'ativo',
  technical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. WORK ORDERS TABLE
CREATE TABLE public.work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE,
  ticket_id UUID REFERENCES public.tickets(id),
  client_id UUID NOT NULL REFERENCES public.clients(id),
  equipment_id UUID NOT NULL REFERENCES public.equipments(id),
  technician_id UUID REFERENCES auth.users(id),
  order_type work_order_type NOT NULL DEFAULT 'pos_venda',
  status work_order_status NOT NULL DEFAULT 'aberta',
  diagnosis TEXT,
  cause TEXT,
  solution TEXT,
  service_time_hours NUMERIC(6,2),
  internal_notes TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_work_order_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 9) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.work_orders;
  NEW.order_number := 'OS-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER generate_work_order_number_trigger
  BEFORE INSERT ON public.work_orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION public.generate_work_order_number();

-- 13. WORK ORDER ITEMS TABLE
CREATE TABLE public.work_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  item_type work_order_item_type NOT NULL DEFAULT 'cobranca',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.work_order_items ENABLE ROW LEVEL SECURITY;

-- 14. MAINTENANCE PLANS TABLE
CREATE TABLE public.maintenance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipments(id) ON DELETE CASCADE,
  component TEXT NOT NULL,
  interval_months INTEGER NOT NULL DEFAULT 6,
  recommendation TEXT,
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_maintenance_plans_updated_at BEFORE UPDATE ON public.maintenance_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. MAINTENANCE EVENTS TABLE
CREATE TABLE public.maintenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_plan_id UUID REFERENCES public.maintenance_plans(id) ON DELETE SET NULL,
  equipment_id UUID NOT NULL REFERENCES public.equipments(id),
  event_type TEXT NOT NULL DEFAULT 'preventiva',
  description TEXT,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;

-- 16. ATTACHMENTS TABLE
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attachments_entity ON public.attachments(entity_type, entity_id);

-- 17. ACTIVITY LOGS TABLE
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);

-- 18. ENGINEERING REPORTS TABLE
CREATE TABLE public.engineering_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'mensal',
  period_start DATE,
  period_end DATE,
  content JSONB,
  generated_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.engineering_reports ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_engineering_reports_updated_at BEFORE UPDATE ON public.engineering_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS POLICIES
-- =============================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Clients
CREATE POLICY "Staff can view clients" ON public.clients FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Staff can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);
CREATE POLICY "Staff can update clients" ON public.clients FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);
CREATE POLICY "Admin can delete clients" ON public.clients FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Equipment Models
CREATE POLICY "Anyone can view equipment models" ON public.equipment_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert equipment models" ON public.equipment_models FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can update equipment models" ON public.equipment_models FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin can delete equipment models" ON public.equipment_models FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Equipments
CREATE POLICY "Staff can view equipments" ON public.equipments FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Staff can insert equipments" ON public.equipments FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);
CREATE POLICY "Staff can update equipments" ON public.equipments FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);

-- Tickets
CREATE POLICY "Staff can view tickets" ON public.tickets FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Staff can insert tickets" ON public.tickets FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);
CREATE POLICY "Staff can update tickets" ON public.tickets FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);

-- Warranty Claims
CREATE POLICY "Staff can view warranty claims" ON public.warranty_claims FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Staff can insert warranty claims" ON public.warranty_claims FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);
CREATE POLICY "Staff can update warranty claims" ON public.warranty_claims FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);

-- Service Requests
CREATE POLICY "Staff can view service requests" ON public.service_requests FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Staff can insert service requests" ON public.service_requests FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);
CREATE POLICY "Staff can update service requests" ON public.service_requests FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento')
);

-- Products
CREATE POLICY "Anyone can view products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Financeiro can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Financeiro can update products" ON public.products FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Admin can delete products" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Work Orders
CREATE POLICY "Staff can view work orders" ON public.work_orders FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia') OR public.has_role(auth.uid(), 'financeiro')
);
CREATE POLICY "Staff can insert work orders" ON public.work_orders FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);
CREATE POLICY "Staff can update work orders" ON public.work_orders FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);

-- Work Order Items
CREATE POLICY "Anyone can view work order items" ON public.work_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert work order items" ON public.work_order_items FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);
CREATE POLICY "Staff can update work order items" ON public.work_order_items FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);
CREATE POLICY "Staff can delete work order items" ON public.work_order_items FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico')
);

-- Maintenance Plans
CREATE POLICY "Anyone can view maintenance plans" ON public.maintenance_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert maintenance plans" ON public.maintenance_plans FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
);
CREATE POLICY "Staff can update maintenance plans" ON public.maintenance_plans FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
);

-- Maintenance Events
CREATE POLICY "Anyone can view maintenance events" ON public.maintenance_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff can insert maintenance events" ON public.maintenance_events FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
);

-- Attachments
CREATE POLICY "Anyone can view attachments" ON public.attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

-- Activity Logs
CREATE POLICY "Staff can view activity logs" ON public.activity_logs FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'atendimento') OR public.has_role(auth.uid(), 'tecnico') OR public.has_role(auth.uid(), 'engenharia')
);
CREATE POLICY "Anyone can insert activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Engineering Reports
CREATE POLICY "Engineering can view reports" ON public.engineering_reports FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engenharia')
);
CREATE POLICY "Engineering can insert reports" ON public.engineering_reports FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engenharia')
);
CREATE POLICY "Engineering can update reports" ON public.engineering_reports FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engenharia')
);
