// src/lib/quoteExtraction.ts

export type QuoteConfidence = "alta" | "media" | "baixa";

export interface QuoteExtractionItem {
  po_item_id: string;
  matched: boolean;
  confidence: QuoteConfidence;
  valor_unitario: number | null;
  data_entrega: string | null;
  percentual_desconto: number | null;
  valor_desconto: number | null;
  observacao: string;
}

export interface QuoteExtractionExtra {
  descricao: string;
  codigo: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  data_entrega: string | null;
  percentual_desconto: number | null;
  valor_desconto: number | null;
}

export interface QuoteExtraction {
  items: QuoteExtractionItem[];
  extra_items: QuoteExtractionExtra[];
  condicao_pagamento: string | null;
  aviso: string | null;
}

// ── coerções ────────────────────────────────────────────────────────────────
function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    if (cleaned === "") return null;
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function toDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // aceita somente ISO YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

function toConfidence(v: unknown): QuoteConfidence {
  return v === "alta" || v === "media" || v === "baixa" ? v : "baixa";
}

// ── normalização ─────────────────────────────────────────────────────────────
export function normalizeQuoteExtraction(raw: unknown, poItemIds: string[]): QuoteExtraction {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const idSet = new Set(poItemIds);

  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: QuoteExtractionItem[] = rawItems
    .map((it) => (it && typeof it === "object" ? (it as Record<string, unknown>) : {}))
    .filter((it) => typeof it.po_item_id === "string" && idSet.has(it.po_item_id as string))
    .map((it) => ({
      po_item_id: it.po_item_id as string,
      matched: it.matched === true,
      confidence: toConfidence(it.confidence),
      valor_unitario: toNumberOrNull(it.valor_unitario),
      data_entrega: toDateOrNull(it.data_entrega),
      percentual_desconto: toNumberOrNull(it.percentual_desconto),
      valor_desconto: toNumberOrNull(it.valor_desconto),
      observacao: toStringOrNull(it.observacao) ?? "",
    }));

  const rawExtras = Array.isArray(obj.extra_items) ? obj.extra_items : [];
  const extra_items: QuoteExtractionExtra[] = rawExtras
    .map((it) => (it && typeof it === "object" ? (it as Record<string, unknown>) : {}))
    .map((it) => ({
      descricao: toStringOrNull(it.descricao) ?? "",
      codigo: toStringOrNull(it.codigo),
      quantidade: toNumberOrNull(it.quantidade),
      valor_unitario: toNumberOrNull(it.valor_unitario),
      data_entrega: toDateOrNull(it.data_entrega),
      percentual_desconto: toNumberOrNull(it.percentual_desconto),
      valor_desconto: toNumberOrNull(it.valor_desconto),
    }))
    .filter((it) => it.descricao !== "");

  return {
    items,
    extra_items,
    condicao_pagamento: toStringOrNull(obj.condicao_pagamento),
    aviso: toStringOrNull(obj.aviso),
  };
}
