
-- 1. Create quote_status enum
CREATE TYPE public.quote_status AS ENUM (
  'rascunho', 'aguardando_aprovacao', 'aprovado', 'reprovado', 'convertido_os', 'cancelado'
);

-- 2. Create quote_item_type enum (broader than work_order_item_type)
CREATE TYPE public.quote_item_type AS ENUM (
  'peca_garantia', 'peca_cobrada', 'servico_garantia', 'servico_cobrado', 'frete', 'desconto'
);

-- 3. Update work_order_item_type enum to support more types
ALTER TYPE public.work_order_item_type ADD VALUE IF NOT EXISTS 'servico_garantia';
ALTER TYPE public.work_order_item_type ADD VALUE IF NOT EXISTS 'servico_cobrado';
ALTER TYPE public.work_order_item_type ADD VALUE IF NOT EXISTS 'frete';
ALTER TYPE public.work_order_item_type ADD VALUE IF NOT EXISTS 'desconto';
ALTER TYPE public.work_order_item_type RENAME VALUE 'garantia' TO 'peca_garantia';
ALTER TYPE public.work_order_item_type RENAME VALUE 'cobranca' TO 'peca_cobrada';

-- 4. Create quotes table
CREATE TABLE public.quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_number TEXT NOT NULL DEFAULT '',
  client_id UUID NOT NULL REFERENCES public.clients(id),
  equipment_id UUID REFERENCES public.equipments(id),
  ticket_id UUID REFERENCES public.tickets(id),
  warranty_claim_id UUID REFERENCES public.warranty_claims(id),
  service_request_id UUID REFERENCES public.service_requests(id),
  work_order_id UUID REFERENCES public.work_orders(id),
  status public.quote_status NOT NULL DEFAULT 'rascunho',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  freight NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  valid_until DATE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. Create quote_items table
CREATE TABLE public.quote_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL DEFAULT '',
  item_type public.quote_item_type NOT NULL DEFAULT 'peca_cobrada',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6. Create technical_history table
CREATE TABLE public.technical_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id UUID NOT NULL REFERENCES public.equipments(id),
  event_type TEXT NOT NULL,
  event_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  description TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  performed_by UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. Auto-generate quote number
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM 9) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.quotes;
  NEW.quote_number := 'ORC-' || EXTRACT(YEAR FROM now()) || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_quote_number
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  WHEN (NEW.quote_number = '' OR NEW.quote_number IS NULL)
  EXECUTE FUNCTION public.generate_quote_number();

-- 8. Updated_at triggers
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_history ENABLE ROW LEVEL SECURITY;

-- 10. RLS policies for quotes
CREATE POLICY "Staff and clients can view quotes" ON public.quotes
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR client_id = ANY(get_my_client_ids()));

CREATE POLICY "Staff can insert quotes" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'atendimento') OR has_role(auth.uid(), 'tecnico'));

CREATE POLICY "Staff can update quotes" ON public.quotes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'atendimento') OR has_role(auth.uid(), 'tecnico'));

-- 11. RLS policies for quote_items
CREATE POLICY "Anyone can view quote items" ON public.quote_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert quote items" ON public.quote_items
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'atendimento') OR has_role(auth.uid(), 'tecnico'));

CREATE POLICY "Staff can update quote items" ON public.quote_items
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'atendimento') OR has_role(auth.uid(), 'tecnico'));

CREATE POLICY "Staff can delete quote items" ON public.quote_items
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'atendimento') OR has_role(auth.uid(), 'tecnico'));

-- 12. RLS policies for technical_history
CREATE POLICY "Staff and clients can view technical history" ON public.technical_history
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()) OR equipment_id IN (SELECT id FROM equipments WHERE client_id = ANY(get_my_client_ids())));

CREATE POLICY "Staff can insert technical history" ON public.technical_history
  FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

-- 13. Enable realtime for technical_history
ALTER PUBLICATION supabase_realtime ADD TABLE public.technical_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;
