# Importação de Orçamento do Fornecedor com IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao importar o orçamento do fornecedor num Pedido de Compra, uma IA lê o arquivo (PDF/imagem/TXT), extrai preços/prazos/descontos e os apresenta numa tela de revisão antes de aplicar aos itens.

**Architecture:** Uma edge function `extract-supplier-quote` envia o arquivo + a lista de itens do PC para o Gemini 2.5 Flash (via OpenRouter) e devolve JSON. O frontend normaliza esse JSON com funções puras testáveis, exibe um diálogo de revisão e, após confirmação, grava os valores nos itens.

**Tech Stack:** React + TypeScript + Vite, Supabase Edge Functions (Deno), OpenRouter (`google/gemini-2.5-flash`), vitest.

**Spec:** `docs/superpowers/specs/2026-05-17-importar-orcamento-ia-design.md`

---

## Estrutura de arquivos

**Novos:**
- `src/lib/quoteExtraction.ts` — tipos + funções puras `normalizeQuoteExtraction` e `buildQuoteItemUpdates`
- `src/lib/quoteExtraction.test.ts` — testes vitest das funções puras
- `src/components/compras/SupplierQuoteReviewDialog.tsx` — diálogo de revisão
- `supabase/functions/extract-supplier-quote/index.ts` — edge function de leitura por IA

**Modificados:**
- `src/pages/PCDetailPage.tsx` — `accept` do input, chamada à IA, abertura do diálogo, botão "Reprocessar com IA"
- `deploy.sh` — deploy da nova edge function

**Observação sobre testes:** o vitest só escaneia `src/**` (`vitest.config.ts`). As funções puras ficam em `src/lib/` e têm testes unitários. A edge function é Deno (fora do escopo do vitest) — é verificada por invocação na Task 7.

---

## Task 1: Tipos e `normalizeQuoteExtraction`

Função pura que recebe o JSON cru da IA + os IDs dos itens do PC e devolve um objeto `QuoteExtraction` normalizado (campos ausentes/ inválidos viram `null`; itens com `po_item_id` desconhecido são descartados).

**Files:**
- Create: `src/lib/quoteExtraction.ts`
- Test: `src/lib/quoteExtraction.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/lib/quoteExtraction.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/quoteExtraction.test.ts`
Expected: FAIL — `Failed to resolve import "./quoteExtraction"`.

- [ ] **Step 3: Implementar `src/lib/quoteExtraction.ts`**

```ts
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/quoteExtraction.test.ts`
Expected: PASS — 4 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quoteExtraction.ts src/lib/quoteExtraction.test.ts
git commit -m "feat(compras): normalizeQuoteExtraction — normaliza JSON da IA"
```

---

## Task 2: `buildQuoteItemUpdates`

Função pura que converte o estado revisado do diálogo em um plano de aplicação: updates nos itens existentes, novos itens (extras marcados) e condição de pagamento.

**Files:**
- Modify: `src/lib/quoteExtraction.ts` (append)
- Modify: `src/lib/quoteExtraction.test.ts` (append)

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `src/lib/quoteExtraction.test.ts`:

```ts
import { buildQuoteItemUpdates } from "./quoteExtraction";

describe("buildQuoteItemUpdates", () => {
  it("gera update só para itens com algum valor preenchido", () => {
    const plan = buildQuoteItemUpdates({
      items: [
        { po_item_id: "a", valor_unitario: 10, data_entrega: "2026-06-01", percentual_desconto: null, valor_desconto: null },
        { po_item_id: "b", valor_unitario: null, data_entrega: null, percentual_desconto: null, valor_desconto: null },
      ],
      extras: [],
      condicao_pagamento: null,
    });
    expect(plan.itemUpdates).toHaveLength(1);
    expect(plan.itemUpdates[0]).toEqual({
      id: "a",
      valor_unitario: 10,
      data_entrega: "2026-06-01",
      percentual_desconto: 0,
      valor_desconto: 0,
    });
  });

  it("inclui só extras marcados, com quantidade padrão 1", () => {
    const plan = buildQuoteItemUpdates({
      items: [],
      extras: [
        { selected: true, descricao: "Arruela", codigo: "AR1", quantidade: null, valor_unitario: 0.5, data_entrega: null, percentual_desconto: null, valor_desconto: null },
        { selected: false, descricao: "Ignorado", codigo: null, quantidade: 2, valor_unitario: 1, data_entrega: null, percentual_desconto: null, valor_desconto: null },
      ],
      condicao_pagamento: "  à vista  ",
    });
    expect(plan.newItems).toHaveLength(1);
    expect(plan.newItems[0]).toMatchObject({ produto_descricao: "Arruela", produto_codigo: "AR1", quantidade: 1, valor_unitario: 0.5 });
    expect(plan.condicao_pagamento).toBe("à vista");
  });

  it("condicao_pagamento vazia vira null", () => {
    const plan = buildQuoteItemUpdates({ items: [], extras: [], condicao_pagamento: "   " });
    expect(plan.condicao_pagamento).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- src/lib/quoteExtraction.test.ts`
Expected: FAIL — `buildQuoteItemUpdates is not exported`.

- [ ] **Step 3: Implementar — append em `src/lib/quoteExtraction.ts`**

```ts
// ── aplicação da revisão ─────────────────────────────────────────────────────
export interface QuoteReviewItem {
  po_item_id: string;
  valor_unitario: number | null;
  data_entrega: string | null;
  percentual_desconto: number | null;
  valor_desconto: number | null;
}

export interface QuoteReviewExtra {
  selected: boolean;
  descricao: string;
  codigo: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  data_entrega: string | null;
  percentual_desconto: number | null;
  valor_desconto: number | null;
}

export interface QuoteReviewState {
  items: QuoteReviewItem[];
  extras: QuoteReviewExtra[];
  condicao_pagamento: string | null;
}

export interface QuoteItemUpdate {
  id: string;
  valor_unitario: number;
  data_entrega: string | null;
  percentual_desconto: number;
  valor_desconto: number;
}

export interface QuoteNewItem {
  produto_codigo: string | null;
  produto_descricao: string;
  quantidade: number;
  valor_unitario: number;
  percentual_desconto: number;
  valor_desconto: number;
  data_entrega: string | null;
}

export interface QuoteApplyPlan {
  itemUpdates: QuoteItemUpdate[];
  newItems: QuoteNewItem[];
  condicao_pagamento: string | null;
}

export function buildQuoteItemUpdates(state: QuoteReviewState): QuoteApplyPlan {
  const itemUpdates: QuoteItemUpdate[] = state.items
    .filter(
      (it) =>
        it.valor_unitario != null ||
        it.data_entrega != null ||
        it.percentual_desconto != null ||
        it.valor_desconto != null,
    )
    .map((it) => ({
      id: it.po_item_id,
      valor_unitario: it.valor_unitario ?? 0,
      data_entrega: it.data_entrega,
      percentual_desconto: it.percentual_desconto ?? 0,
      valor_desconto: it.valor_desconto ?? 0,
    }));

  const newItems: QuoteNewItem[] = state.extras
    .filter((e) => e.selected && e.descricao.trim() !== "")
    .map((e) => ({
      produto_codigo: e.codigo,
      produto_descricao: e.descricao.trim(),
      quantidade: e.quantidade ?? 1,
      valor_unitario: e.valor_unitario ?? 0,
      percentual_desconto: e.percentual_desconto ?? 0,
      valor_desconto: e.valor_desconto ?? 0,
      data_entrega: e.data_entrega,
    }));

  const cond = (state.condicao_pagamento ?? "").trim();

  return { itemUpdates, newItems, condicao_pagamento: cond === "" ? null : cond };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- src/lib/quoteExtraction.test.ts`
Expected: PASS — 7 testes verdes (4 da Task 1 + 3 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quoteExtraction.ts src/lib/quoteExtraction.test.ts
git commit -m "feat(compras): buildQuoteItemUpdates — plano de aplicação da revisão"
```

---

## Task 3: Edge function `extract-supplier-quote`

Recebe `{ purchase_order_id, file_url, file_type }`, carrega os itens do PC, lê o arquivo com o Gemini e devolve `{ ok, data }` com o JSON cru da IA.

**Files:**
- Create: `supabase/functions/extract-supplier-quote/index.ts`

- [ ] **Step 1: Implementar a edge function**

Criar `supabase/functions/extract-supplier-quote/index.ts`:

```ts
// supabase/functions/extract-supplier-quote/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} não respondeu em ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const SYSTEM_PROMPT =
  "Você extrai dados de orçamentos de fornecedores. Responda SOMENTE com um objeto JSON válido, sem texto fora do JSON.";

function buildInstruction(items: { id: string; codigo: string | null; descricao: string | null; quantidade: number }[]): string {
  return [
    "Abaixo está a lista de itens de um Pedido de Compra (campo po_item_id é o identificador).",
    JSON.stringify(items),
    "",
    "No documento/anexo está o orçamento de um fornecedor. Para CADA item do pedido,",
    "localize a linha correspondente no orçamento e extraia: valor unitário, data de entrega",
    "(formato YYYY-MM-DD) e desconto. Liste também itens cotados no orçamento que NÃO",
    "correspondem a nenhum item do pedido. Identifique a condição de pagamento geral.",
    "",
    "Responda no schema JSON exato:",
    JSON.stringify({
      items: [{
        po_item_id: "string (um dos po_item_id acima)",
        matched: "boolean",
        confidence: "alta | media | baixa",
        valor_unitario: "number | null",
        data_entrega: "YYYY-MM-DD | null",
        percentual_desconto: "number | null",
        valor_desconto: "number | null",
        observacao: "string",
      }],
      extra_items: [{
        descricao: "string", codigo: "string | null", quantidade: "number | null",
        valor_unitario: "number | null", data_entrega: "YYYY-MM-DD | null",
        percentual_desconto: "number | null", valor_desconto: "number | null",
      }],
      condicao_pagamento: "string | null",
      aviso: "string | null (preencha se algo não ficou claro)",
    }),
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { purchase_order_id, file_url, file_type } = await req.json();
    if (!purchase_order_id || !file_url || !file_type) {
      throw new Error("purchase_order_id, file_url e file_type são obrigatórios");
    }

    const aiApiKey = Deno.env.get("AI_API_KEY");
    if (!aiApiKey) throw new Error("AI_API_KEY não configurado nos secrets");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rawItems } = await supabase
      .from("purchase_order_items")
      .select("id, produto_codigo, produto_descricao, quantidade")
      .eq("purchase_order_id", purchase_order_id)
      .order("posicao", { ascending: true });
    const items = (rawItems ?? []).map((it: Record<string, unknown>) => ({
      id: it.id as string,
      codigo: (it.produto_codigo as string) ?? null,
      descricao: (it.produto_descricao as string) ?? null,
      quantidade: Number(it.quantidade ?? 0),
    }));

    // Baixa o arquivo
    const fileRes = await withTimeout(fetch(file_url), 20000, "download do arquivo");
    if (!fileRes.ok) throw new Error(`Falha ao baixar o arquivo (HTTP ${fileRes.status})`);

    // Monta o conteúdo da mensagem do usuário conforme o tipo
    const instruction = buildInstruction(items);
    let userContent: unknown;
    if (file_type === "txt") {
      const text = await fileRes.text();
      userContent = `${instruction}\n\n--- CONTEÚDO DO ORÇAMENTO (TXT) ---\n${text}`;
    } else if (file_type === "image") {
      const b64 = bufferToBase64(await fileRes.arrayBuffer());
      userContent = [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
      ];
    } else if (file_type === "pdf") {
      const b64 = bufferToBase64(await fileRes.arrayBuffer());
      userContent = [
        { type: "text", text: instruction },
        { type: "file", file: { filename: "orcamento.pdf", file_data: `data:application/pdf;base64,${b64}` } },
      ];
    } else {
      throw new Error(`file_type inválido: ${file_type}`);
    }

    // Chama o Gemini via OpenRouter
    const aiRes = await withTimeout(
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${aiApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4000,
        }),
      }),
      60000,
      "leitura por IA",
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`IA indisponível (HTTP ${aiRes.status}): ${errText.slice(0, 200)}`);
    }
    const aiData = await aiRes.json();
    const content: string = aiData.choices?.[0]?.message?.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // tenta extrair o primeiro bloco {...}
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("A IA não retornou JSON válido");
      parsed = JSON.parse(m[0]);
    }

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extract-supplier-quote] ERRO:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Verificar o build da função (typecheck Deno superficial)**

A função é Deno; não há typecheck local. Conferir visualmente que: imports resolvem, não há `any` solto sem necessidade, o schema do JSON de saída bate com `QuoteExtraction` da Task 1.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/extract-supplier-quote/index.ts
git commit -m "feat(compras): edge function extract-supplier-quote (leitura de orçamento por IA)"
```

---

## Task 4: Diálogo de revisão `SupplierQuoteReviewDialog`

Modal que recebe a `QuoteExtraction` normalizada + os itens atuais do PC, mantém o estado revisável e, ao confirmar, chama `buildQuoteItemUpdates` e dispara `onApply`.

**Files:**
- Create: `src/components/compras/SupplierQuoteReviewDialog.tsx`

- [ ] **Step 1: Implementar o componente**

Criar `src/components/compras/SupplierQuoteReviewDialog.tsx`:

```tsx
// src/components/compras/SupplierQuoteReviewDialog.tsx
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PurchaseOrderItem } from "@/types/purchaseOrder";
import {
  buildQuoteItemUpdates,
  type QuoteExtraction,
  type QuoteReviewItem,
  type QuoteReviewExtra,
  type QuoteApplyPlan,
} from "@/lib/quoteExtraction";

interface Props {
  open: boolean;
  fileName: string;
  extraction: QuoteExtraction;
  items: PurchaseOrderItem[];
  onClose: () => void;
  onApply: (plan: QuoteApplyPlan) => void;
}

const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const confidenceBadge: Record<string, { label: string; cls: string }> = {
  alta: { label: "✓ alta", cls: "text-emerald-600" },
  media: { label: "~ média", cls: "text-amber-600" },
  baixa: { label: "⚠ baixa", cls: "text-red-600" },
};

export function SupplierQuoteReviewDialog({ open, fileName, extraction, items, onClose, onApply }: Props) {
  // Estado revisável dos itens do PC (pré-preenchido pela extração da IA)
  const [reviewItems, setReviewItems] = useState<QuoteReviewItem[]>(() =>
    items.map((it) => {
      const found = extraction.items.find((e) => e.po_item_id === it.id);
      return {
        po_item_id: it.id,
        valor_unitario: found?.valor_unitario ?? null,
        data_entrega: found?.data_entrega ?? null,
        percentual_desconto: found?.percentual_desconto ?? null,
        valor_desconto: found?.valor_desconto ?? null,
      };
    }),
  );
  const [extras, setExtras] = useState<QuoteReviewExtra[]>(() =>
    extraction.extra_items.map((e) => ({ selected: false, ...e })),
  );
  const [condicao, setCondicao] = useState(extraction.condicao_pagamento ?? "");

  const matchByItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of extraction.items) {
      m.set(e.po_item_id, e.matched ? e.confidence : "baixa");
    }
    return m;
  }, [extraction]);

  function patchItem(id: string, patch: Partial<QuoteReviewItem>) {
    setReviewItems((prev) => prev.map((it) => (it.po_item_id === id ? { ...it, ...patch } : it)));
  }
  function patchExtra(idx: number, patch: Partial<QuoteReviewExtra>) {
    setExtras((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  function handleApply() {
    onApply(buildQuoteItemUpdates({ items: reviewItems, extras, condicao_pagamento: condicao }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisão do orçamento — IA leu "{fileName}"</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Condição de pagamento */}
          <div className="space-y-1.5">
            <Label>Condição de pagamento detectada</Label>
            <Input value={condicao} onChange={(e) => setCondicao(e.target.value)} placeholder="Ex: 30/60/90 dias" />
          </div>

          {/* Itens do pedido */}
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Itens do pedido
            </p>
            <div className="rounded-md border divide-y">
              {items.map((it) => {
                const ri = reviewItems.find((r) => r.po_item_id === it.id)!;
                const conf = matchByItem.get(it.id) ?? "baixa";
                const badge = confidenceBadge[conf];
                return (
                  <div key={it.id} className="p-2 grid grid-cols-12 gap-2 items-center">
                    <span className="col-span-3 text-xs font-medium truncate">
                      {it.produto_descricao ?? it.produto_codigo ?? "—"}
                    </span>
                    <span className="col-span-1 text-xs text-muted-foreground">{it.quantidade}</span>
                    <Input
                      className="col-span-2 h-8 text-xs"
                      placeholder="Vlr unit."
                      value={ri.valor_unitario ?? ""}
                      onChange={(e) => patchItem(it.id, { valor_unitario: numOrNull(e.target.value) })}
                    />
                    <Input
                      className="col-span-2 h-8 text-xs"
                      placeholder="% desc."
                      value={ri.percentual_desconto ?? ""}
                      onChange={(e) => patchItem(it.id, { percentual_desconto: numOrNull(e.target.value) })}
                    />
                    <Input
                      type="date"
                      className="col-span-2 h-8 text-xs"
                      value={ri.data_entrega ?? ""}
                      onChange={(e) => patchItem(it.id, { data_entrega: e.target.value || null })}
                    />
                    <span className={`col-span-2 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Itens fora do pedido */}
          {extras.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                Itens cotados fora do pedido
              </p>
              <div className="rounded-md border divide-y">
                {extras.map((e, idx) => (
                  <label key={idx} className="p-2 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.selected}
                      onChange={(ev) => patchExtra(idx, { selected: ev.target.checked })}
                    />
                    <span className="text-xs flex-1 truncate">{e.descricao}</span>
                    <span className="text-xs text-muted-foreground">{e.quantidade ?? 1}×</span>
                    <span className="text-xs font-medium">
                      {e.valor_unitario != null ? `R$ ${e.valor_unitario}` : "—"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Aviso da IA */}
          {extraction.aviso && (
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
              ⚠ {extraction.aviso}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleApply}>Aplicar ao pedido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verificar o typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/compras/SupplierQuoteReviewDialog.tsx
git commit -m "feat(compras): SupplierQuoteReviewDialog — tela de revisão do orçamento"
```

---

## Task 5: Integrar no `PCDetailPage`

Trocar o `accept` do input, disparar a extração por IA após o upload, abrir o diálogo de revisão, aplicar o resultado e adicionar o botão "Reprocessar com IA".

**Files:**
- Modify: `src/pages/PCDetailPage.tsx`

- [ ] **Step 1: Adicionar imports e estado**

No topo de `src/pages/PCDetailPage.tsx`, junto aos imports existentes, adicionar:

```tsx
import { SupplierQuoteReviewDialog } from "@/components/compras/SupplierQuoteReviewDialog";
import { normalizeQuoteExtraction, type QuoteExtraction, type QuoteApplyPlan } from "@/lib/quoteExtraction";
```

Dentro do componente `PCDetailPage`, junto aos outros `useState`, adicionar:

```tsx
const [extracting, setExtracting] = useState(false);
const [reviewData, setReviewData] = useState<{ fileName: string; extraction: QuoteExtraction } | null>(null);
```

- [ ] **Step 2: Adicionar a função de extração e a de aplicação**

Logo após `handleFileChange`, adicionar:

```tsx
// Detecta o file_type a partir do nome/URL do arquivo
function detectFileType(nameOrUrl: string): "pdf" | "image" | "txt" | null {
  const lower = nameOrUrl.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(lower)) return "image";
  return null;
}

async function runExtraction(fileUrl: string, fileName: string) {
  const fileType = detectFileType(fileName);
  if (!fileType) {
    toast.error("Formato não suportado para leitura por IA (use PDF, imagem ou TXT).");
    return;
  }
  setExtracting(true);
  try {
    const { data, error } = await supabase.functions.invoke("extract-supplier-quote", {
      body: { purchase_order_id: po.id, file_url: fileUrl, file_type: fileType },
    });
    if (error || !data?.ok) {
      toast.error(data?.error ?? error?.message ?? "Não foi possível ler com IA — use 'Reprocessar' ou preencha manual.");
      return;
    }
    const extraction = normalizeQuoteExtraction(data.data, items.map((it) => it.id));
    setReviewData({ fileName, extraction });
  } catch (err: any) {
    toast.error(err.message ?? "Falha na leitura por IA");
  } finally {
    setExtracting(false);
  }
}

function handleApplyExtraction(plan: QuoteApplyPlan) {
  for (const upd of plan.itemUpdates) {
    updateItem.mutate({ id: upd.id, valor_unitario: upd.valor_unitario, data_entrega: upd.data_entrega, percentual_desconto: upd.percentual_desconto, valor_desconto: upd.valor_desconto } as any);
  }
  plan.newItems.forEach((ni, idx) => {
    addItem.mutate({
      purchase_order_id: po.id,
      nomus_produto_id: null,
      produto_codigo: ni.produto_codigo,
      produto_descricao: ni.produto_descricao,
      quantidade: ni.quantidade,
      valor_unitario: ni.valor_unitario,
      percentual_desconto: ni.percentual_desconto,
      valor_desconto: ni.valor_desconto,
      data_entrega: ni.data_entrega,
      posicao: items.length + 1 + idx,
    } as any);
  });
  if (plan.condicao_pagamento) update({ condicao_pagamento: plan.condicao_pagamento });
  setReviewData(null);
  toast.success("Orçamento aplicado ao pedido!");
}
```

- [ ] **Step 3: Chamar a extração após o upload**

Em `handleFileChange`, logo após o `update({ supplier_quote_pdf_url: url, ... })` e o `toast.success("Orçamento importado com sucesso!")`, adicionar:

```tsx
      // Dispara a leitura por IA
      runExtraction(url, file.name);
```

- [ ] **Step 4: Trocar o `accept` do input**

Localizar o `<input ref={fileInputRef} type="file" accept=".pdf" ... />` e trocar `accept=".pdf"` por:

```tsx
            accept=".pdf,image/*,.txt"
```

- [ ] **Step 5: Adicionar o botão "Reprocessar com IA" e o diálogo**

Na barra de Ações, logo após o bloco do botão "Importar orçamento" (a `<div className="flex items-center gap-2">` que o contém), adicionar o botão de reprocessar:

```tsx
          {po.supplier_quote_pdf_url && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => runExtraction(po.supplier_quote_pdf_url!, po.supplier_quote_pdf_url!)}
              disabled={extracting}
            >
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {extracting ? "Lendo com IA..." : "Reprocessar com IA"}
            </Button>
          )}
```

E, antes do fechamento final do JSX do componente (antes do último `</div>`), montar o diálogo:

```tsx
      {reviewData && (
        <SupplierQuoteReviewDialog
          open={true}
          fileName={reviewData.fileName}
          extraction={reviewData.extraction}
          items={items}
          onClose={() => setReviewData(null)}
          onApply={handleApplyExtraction}
        />
      )}
```

- [ ] **Step 6: Verificar o typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PCDetailPage.tsx
git commit -m "feat(compras): PCDetailPage integra leitura de orçamento por IA"
```

---

## Task 6: Registrar a função no `deploy.sh`

**Files:**
- Modify: `deploy.sh`

- [ ] **Step 1: Adicionar a linha de deploy**

Em `deploy.sh`, logo após a linha `supabase functions deploy send-purchase-order-email`, adicionar:

```bash
supabase functions deploy extract-supplier-quote
```

- [ ] **Step 2: Commit**

```bash
git add deploy.sh
git commit -m "chore(deploy): deploy.sh publica extract-supplier-quote"
```

---

## Task 7: Deploy e verificação ponta a ponta

**Files:** nenhum (operacional)

- [ ] **Step 1: Rodar a suíte de testes completa**

Run: `npm test`
Expected: todos os testes verdes, incluindo os 7 de `quoteExtraction.test.ts`.

- [ ] **Step 2: Typecheck final**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sem erros.

- [ ] **Step 3: Deploy da edge function na VPS**

Via SSH na VPS (`root@103.199.187.99`, `/opt/posvenda`): `git pull origin main` e `supabase functions deploy extract-supplier-quote`.
Expected: `Deployed Functions on project ehqkggiuouczmafmlzls: extract-supplier-quote`.

- [ ] **Step 4: Verificar a função por invocação**

Invocar `extract-supplier-quote` (curl, com a anon key JWT no header `Authorization: Bearer`) passando um `purchase_order_id` real, um `file_url` de um orçamento de teste no bucket e o `file_type` correspondente. Repetir para os 3 formatos (PDF, imagem, TXT).
Expected: resposta `{ ok: true, data: {...} }` com `items`/`extra_items`/`condicao_pagamento`. Em erro (arquivo inexistente), `{ ok: false, error: "..." }`.

- [ ] **Step 5: Rebuild do frontend na VPS**

Rebuild do serviço `posvenda_posvenda` (build Docker + `docker service update`).
Expected: serviço converge, nova imagem `Running`.

- [ ] **Step 6: Verificação manual ponta a ponta**

No CRM em produção: abrir um Pedido de Compra com itens, clicar em "Importar orçamento", anexar um orçamento real → conferir que o diálogo de revisão abre com os valores → ajustar se preciso → "Aplicar ao pedido" → confirmar que os itens foram preenchidos. Testar também um item não casado e um item extra.

- [ ] **Step 7: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "chore(compras): ajustes finais da importação de orçamento por IA"
```

---

## Critério de pronto

- `npm test` verde (7 testes de `quoteExtraction.test.ts`).
- `extract-supplier-quote` retorna JSON válido para PDF, imagem e TXT.
- O diálogo de revisão abre com os dados extraídos e permite editar.
- "Aplicar ao pedido" grava `valor_unitario`/`data_entrega`/desconto nos itens, adiciona os extras marcados e a condição de pagamento.
- Falha de IA não desfaz o anexo do arquivo (mensagem de erro clara).
