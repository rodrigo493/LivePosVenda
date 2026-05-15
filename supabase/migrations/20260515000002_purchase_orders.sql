-- Pedido de Compras (PC): tabelas, RPC, RLS, storage

-- 1. purchase_orders (cabeçalho)
CREATE TABLE public.purchase_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id                   uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  order_number                text UNIQUE NOT NULL,
  status                      text NOT NULL DEFAULT 'rascunho',
  nomus_empresa_id            integer,
  nomus_empresa_label         text,
  nomus_fornecedor_id         integer,
  nomus_fornecedor_nome       text,
  nomus_tipo_movimentacao_id  integer,
  nomus_tipo_movimentacao_label text,
  data_emissao                date,
  data_entrega_padrao         date,
  nomus_contato_label         text,
  nomus_comprador_id          integer,
  nomus_comprador_nome        text,
  condicao_pagamento          text,
  observacoes                 text,
  nomus_order_id              integer,
  nomus_codigo_pedido         text,
  nomus_sent_at               timestamptz,
  email_sent_at               timestamptz,
  email_to                    text,
  supplier_quote_pdf_url      text,
  supplier_quote_uploaded_at  timestamptz,
  created_by                  uuid REFERENCES auth.users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_orders_ticket ON public.purchase_orders(ticket_id);

-- 2. purchase_order_items (itens)
CREATE TABLE public.purchase_order_items (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id               uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  nomus_produto_id                integer,
  produto_codigo                  text,
  produto_descricao               text,
  quantidade                      numeric NOT NULL DEFAULT 0,
  valor_unitario                  numeric NOT NULL DEFAULT 0,
  percentual_desconto             numeric NOT NULL DEFAULT 0,
  valor_desconto                  numeric NOT NULL DEFAULT 0,
  nomus_unidade_medida_id         integer,
  unidade_medida_label            text,
  nomus_classificacao_financeira_id integer,
  classificacao_financeira_label  text,
  data_entrega                    date,
  posicao                         integer NOT NULL DEFAULT 0,
  created_at                      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_order_items_po ON public.purchase_order_items(purchase_order_id);

-- 3. suppliers (agenda local de fornecedores)
CREATE TABLE public.suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nomus_pessoa_id integer UNIQUE NOT NULL,
  nome            text NOT NULL,
  email           text,
  telefone        text,
  contato         text,
  observacoes     text,
  ativo           boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 4. RPC gerador de número
CREATE OR REPLACE FUNCTION public.generate_pc_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  seq_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO seq_num
  FROM public.purchase_orders
  WHERE order_number LIKE 'PC.%';
  RETURN 'PC.' || SUBSTRING(EXTRACT(YEAR FROM now())::text FROM 3) || '.' || LPAD(seq_num::TEXT, 3, '0');
END;
$$;

-- 5. RLS
ALTER TABLE public.purchase_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "po_all"   ON public.purchase_orders      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "poi_all"  ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "supp_all" ON public.suppliers            FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Storage bucket para os PDFs do fornecedor
INSERT INTO storage.buckets (id, name, public)
VALUES ('compras-orcamentos', 'compras-orcamentos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "compras_orcamentos_read"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'compras-orcamentos');
CREATE POLICY "compras_orcamentos_write"  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'compras-orcamentos');
CREATE POLICY "compras_orcamentos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'compras-orcamentos');
CREATE POLICY "compras_orcamentos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'compras-orcamentos');
