import { describe, it, expect } from "vitest";
import { normalizeQuoteExtraction } from "./quoteExtraction";

describe("normalizeQuoteExtraction", () => {
  const poIds = ["item-a", "item-b"];

  it("normaliza um resultado completo da IA", () => {
    const raw = {
      items: [
        {
          po_item_id: "item-a",
          matched: true,
          confidence: "alta",
          valor_unitario: "12,50",
          data_entrega: "2026-06-10",
          percentual_desconto: 5,
          valor_desconto: null,
          observacao: "casado por descrição",
        },
      ],
      extra_items: [
        { descricao: "Arruela M6", codigo: null, quantidade: 100, valor_unitario: 0.1 },
      ],
      condicao_pagamento: "30/60/90 dias",
      aviso: null,
    };
    const r = normalizeQuoteExtraction(raw, poIds);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      po_item_id: "item-a",
      matched: true,
      confidence: "alta",
      valor_unitario: 12.5,
      data_entrega: "2026-06-10",
      percentual_desconto: 5,
      valor_desconto: null,
    });
    expect(r.extra_items).toHaveLength(1);
    expect(r.extra_items[0].descricao).toBe("Arruela M6");
    expect(r.condicao_pagamento).toBe("30/60/90 dias");
  });

  it("descarta itens com po_item_id desconhecido", () => {
    const raw = { items: [{ po_item_id: "fantasma", valor_unitario: 1 }] };
    expect(normalizeQuoteExtraction(raw, poIds).items).toHaveLength(0);
  });

  it("trata entrada inválida sem quebrar", () => {
    const r = normalizeQuoteExtraction(null, poIds);
    expect(r.items).toEqual([]);
    expect(r.extra_items).toEqual([]);
    expect(r.condicao_pagamento).toBeNull();
    expect(r.aviso).toBeNull();
  });

  it("coage confidence inválida para 'baixa' e data inválida para null", () => {
    const raw = {
      items: [{ po_item_id: "item-b", confidence: "xpto", data_entrega: "10/06/2026" }],
    };
    const r = normalizeQuoteExtraction(raw, poIds);
    expect(r.items[0].confidence).toBe("baixa");
    expect(r.items[0].data_entrega).toBeNull();
  });

  it("interpreta número decimal com ponto e com vírgula", () => {
    const r = normalizeQuoteExtraction(
      { items: [
        { po_item_id: "item-a", valor_unitario: "12.50" },
        { po_item_id: "item-b", valor_unitario: "1.200,75" },
      ] },
      poIds,
    );
    expect(r.items[0].valor_unitario).toBe(12.5);
    expect(r.items[1].valor_unitario).toBe(1200.75);
  });

  it("descarta extra_items com descrição vazia", () => {
    const r = normalizeQuoteExtraction(
      { extra_items: [
        { descricao: "Válido", valor_unitario: 1 },
        { descricao: "", valor_unitario: 2 },
        { descricao: null, valor_unitario: 3 },
      ] },
      poIds,
    );
    expect(r.extra_items).toHaveLength(1);
    expect(r.extra_items[0].descricao).toBe("Válido");
  });
});
