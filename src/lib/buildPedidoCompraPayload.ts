// src/lib/buildPedidoCompraPayload.ts
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

/** Converte "YYYY-MM-DD" para "dd/MM/yyyy". Retorna "" se vazio. */
function toBrDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Payload do POST /rest/pedidoscompra montado no browser.
 * Os IDs de condição/forma de pagamento NÃO entram aqui — são injetados
 * pela edge function a partir de variáveis de ambiente (defaults configuráveis).
 */
export interface PedidoCompraPayload {
  codigoPedido: string;
  idEmpresa: number | null;
  idTipoMovimentacao: number | null;
  idPessoaFornecedor: number | null;
  dataEmissao: string;
  dataEntregaPadrao: string;
  itensPedidoCompra: Array<{
    idProduto: number | null;
    idTipoMovimentacao: number | null;
    idUnidadeMedida: number | null;
    idClassificacaoFinanceira: number | null;
    item: string;
    percentualDesconto: string;
    quantidade: string;
    status: number;
    valorDesconto: string;
    valorUnitario: string;
    dataEntrega: string;
  }>;
}

export function buildPedidoCompraPayload(
  po: PurchaseOrder,
  items: PurchaseOrderItem[],
): PedidoCompraPayload {
  return {
    codigoPedido: po.order_number,
    idEmpresa: po.nomus_empresa_id,
    idTipoMovimentacao: po.nomus_tipo_movimentacao_id,
    idPessoaFornecedor: po.nomus_fornecedor_id,
    dataEmissao: toBrDate(po.data_emissao),
    dataEntregaPadrao: toBrDate(po.data_entrega_padrao),
    itensPedidoCompra: items.map((it) => ({
      idProduto: it.nomus_produto_id,
      idTipoMovimentacao: po.nomus_tipo_movimentacao_id,
      idUnidadeMedida: it.nomus_unidade_medida_id,
      idClassificacaoFinanceira: it.nomus_classificacao_financeira_id,
      item: String(it.posicao).padStart(5, "0"),
      percentualDesconto: String(it.percentual_desconto ?? 0),
      quantidade: String(it.quantidade ?? 0),
      status: 3,
      valorDesconto: String(it.valor_desconto ?? 0),
      valorUnitario: String(it.valor_unitario ?? 0),
      dataEntrega: toBrDate(it.data_entrega),
    })),
  };
}
