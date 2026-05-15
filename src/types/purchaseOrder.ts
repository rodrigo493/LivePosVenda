// src/types/purchaseOrder.ts
export type PurchaseOrderStatus =
  | "rascunho"
  | "enviado_fornecedor"
  | "orcamento_recebido"
  | "criado_nomus"
  | "cancelado";

export interface PurchaseOrder {
  id: string;
  ticket_id: string | null;
  order_number: string;
  status: PurchaseOrderStatus;
  nomus_empresa_id: number | null;
  nomus_empresa_label: string | null;
  nomus_fornecedor_id: number | null;
  nomus_fornecedor_nome: string | null;
  nomus_tipo_movimentacao_id: number | null;
  nomus_tipo_movimentacao_label: string | null;
  data_emissao: string | null;
  data_entrega_padrao: string | null;
  nomus_contato_label: string | null;
  nomus_comprador_id: number | null;
  nomus_comprador_nome: string | null;
  condicao_pagamento: string | null;
  observacoes: string | null;
  nomus_order_id: number | null;
  nomus_codigo_pedido: string | null;
  nomus_sent_at: string | null;
  email_sent_at: string | null;
  email_to: string | null;
  supplier_quote_pdf_url: string | null;
  supplier_quote_uploaded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  nomus_produto_id: number | null;
  produto_codigo: string | null;
  produto_descricao: string | null;
  quantidade: number;
  valor_unitario: number;
  percentual_desconto: number;
  valor_desconto: number;
  nomus_unidade_medida_id: number | null;
  unidade_medida_label: string | null;
  nomus_classificacao_financeira_id: number | null;
  classificacao_financeira_label: string | null;
  data_entrega: string | null;
  posicao: number;
  created_at: string;
}

export interface Supplier {
  id: string;
  nomus_pessoa_id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  contato: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  rascunho: "Rascunho",
  enviado_fornecedor: "Enviado ao fornecedor",
  orcamento_recebido: "Orçamento recebido",
  criado_nomus: "Criado no Nomus",
  cancelado: "Cancelado",
};
