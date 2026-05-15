// src/lib/buildPedidoCompraPayload.test.ts
import { describe, it, expect } from "vitest";
import { buildPedidoCompraPayload } from "./buildPedidoCompraPayload";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

const po = {
  order_number: "PC.26.001",
  nomus_empresa_id: 2,
  nomus_tipo_movimentacao_id: 120,
  nomus_fornecedor_id: 442,
  data_emissao: "2026-03-14",
  data_entrega_padrao: "2026-03-20",
} as PurchaseOrder;

const items = [{
  nomus_produto_id: 10,
  nomus_unidade_medida_id: 47,
  nomus_classificacao_financeira_id: 1,
  quantidade: 500,
  valor_unitario: 100,
  percentual_desconto: 0,
  valor_desconto: 0,
  data_entrega: "2026-03-20",
  posicao: 1,
}] as PurchaseOrderItem[];

describe("buildPedidoCompraPayload", () => {
  it("monta o corpo com datas em dd/MM/yyyy e itens", () => {
    const r = buildPedidoCompraPayload(po, items);
    expect(r.codigoPedido).toBe("PC.26.001");
    expect(r.idEmpresa).toBe(2);
    expect(r.idPessoaFornecedor).toBe(442);
    expect(r.dataEmissao).toBe("14/03/2026");
    expect(r.itensPedidoCompra).toHaveLength(1);
    expect(r.itensPedidoCompra[0]).toMatchObject({
      idProduto: 10, idUnidadeMedida: 47, idTipoMovimentacao: 120,
      item: "00001", quantidade: "500", valorUnitario: "100", status: 3,
    });
  });
});
