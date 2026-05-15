# Pedido de Compras (PC) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao CRM um módulo de Pedido de Compras para o setor de compras: selecionar matéria-prima via Nomus, enviar a lista ao fornecedor (PDF/e-mail), importar o orçamento e criar o pedido no Nomus.

**Architecture:** Espelha o padrão PA (aba no card + página de detalhe + página de lista) com tabelas próprias (`purchase_orders`, `purchase_order_items`, `suppliers`). Integração Nomus via edge functions. PDF gerado client-side com jsPDF. E-mail via edge function + SMTP Hostinger.

**Tech Stack:** React 18 + TypeScript, Vite, Supabase (Postgres + Edge Functions Deno), React Query, jsPDF, shadcn/ui, Tailwind.

**Spec de referência:** `docs/superpowers/specs/2026-05-15-pedido-de-compras-design.md`

**Convenções do projeto:**
- Tabelas novas não estão nos tipos gerados do Supabase → usar `(supabase as any)` (padrão do projeto).
- Verificação por tarefa: `npx tsc --noEmit` e `npm run build`. Testes de lógica pura: `npm run test` (vitest).
- Migrations: arquivo em `supabase/migrations/`, aplicado pelo processo de deploy do projeto (`deploy.sh` / `supabase db push`).
- Edge functions chamadas do browser DEVEM incluir `apikey, x-client-info` nos headers CORS permitidos.
- `git push` é exclusivo do @devops — neste projeto o usuário autoriza commit+push direto na `main`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260515000000_purchase_orders.sql` | Tabelas, RPC, RLS, bucket |
| `src/types/purchaseOrder.ts` | Tipos TypeScript do módulo |
| `src/hooks/usePurchaseOrders.ts` | CRUD de pedidos e itens (React Query) |
| `src/hooks/useSuppliers.ts` | CRUD da agenda de fornecedores |
| `src/hooks/useNomusLookup.ts` | Busca no Nomus (pessoas, tiposMovimentacao) |
| `src/lib/purchaseOrderPdf.ts` | Geração do PDF da lista (jsPDF) |
| `src/lib/buildPedidoCompraPayload.ts` | Monta o corpo JSON do POST Nomus (lógica pura, testável) |
| `src/components/compras/NomusPessoaSearch.tsx` | Autocomplete de fornecedor/comprador |
| `src/components/compras/PurchaseOrderItemsTable.tsx` | Tabela de itens do pedido |
| `src/pages/PCDetailPage.tsx` | Página de detalhe do PC |
| `src/pages/PedidosCompraPage.tsx` | Lista de PCs |
| `src/pages/FornecedoresPage.tsx` | Agenda de fornecedores |
| `supabase/functions/nomus-search/index.ts` | Estender com `pessoas` e `tiposMovimentacao` |
| `supabase/functions/nomus-create-purchase-order/index.ts` | Criar pedido no Nomus |
| `supabase/functions/send-purchase-order-email/index.ts` | Enviar e-mail ao fornecedor |
| `src/components/tickets/TicketDetailDialog.tsx` | Nova aba "Ped. Compras" |
| `src/App.tsx`, `src/components/layout/AppSidebar.tsx`, `src/lib/crmModules.ts` | Rotas, menu, permissões |

---

## Task 1: Migration — tabelas, RPC, RLS, bucket

**Files:**
- Create: `supabase/migrations/20260515000000_purchase_orders.sql`

- [ ] **Step 1: Escrever a migration**

```sql
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
```

- [ ] **Step 2: Validar a sintaxe SQL**

Abrir o arquivo e revisar: nomes de tabelas, ausência de vírgulas finais, FKs apontando para tabelas existentes (`tickets`, `auth.users`). Confirmar que não há outra migration com o prefixo `20260515000000`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260515000000_purchase_orders.sql
git commit -m "feat(compras): migration de purchase_orders, items, suppliers e RPC"
```

> A aplicação no banco acontece no deploy. Após aplicada, validar manualmente no SQL editor do Supabase: `SELECT public.generate_pc_number();` deve retornar `PC.26.001`.

---

## Task 2: Tipos TypeScript

**Files:**
- Create: `src/types/purchaseOrder.ts`

- [ ] **Step 1: Criar o arquivo de tipos**

```typescript
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
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/types/purchaseOrder.ts
git commit -m "feat(compras): tipos TypeScript do Pedido de Compras"
```

---

## Task 3: Estender edge function `nomus-search`

**Files:**
- Modify: `supabase/functions/nomus-search/index.ts`

> Antes de editar, ler o arquivo inteiro para seguir o estilo existente (proxy `/api/nomus/rest/`, headers, tratamento do `type`).

- [ ] **Step 1: Adicionar o case `pessoas`**

Dentro do `switch (type)` (ou cadeia de `if`) existente, adicionar um ramo que:
1. Lê `query` (termo) e `categoria` (`fornecedor` | `comprador`) do corpo da requisição.
2. Chama `GET /api/nomus/rest/pessoas?query=nome="*${termo}*"&size=50`.
3. Filtra o resultado por `p.categorias?.[categoria] === true`.
4. Retorna array `{ id, nome, codigo, cnpj, email, contatos }`.

```typescript
if (type === "pessoas") {
  const termo = (body.query ?? "").trim();
  const categoria = body.categoria === "comprador" ? "comprador" : "fornecedor";
  const url = `${NOMUS_BASE}/rest/pessoas?query=${encodeURIComponent(`nome="*${termo}*"`)}&size=50`;
  const resp = await fetch(url, { headers: nomusHeaders });
  const list = resp.ok ? await resp.json() : [];
  const filtered = (Array.isArray(list) ? list : [])
    .filter((p: any) => p?.categorias?.[categoria] === true)
    .map((p: any) => ({
      id: p.id,
      nome: p.nome,
      codigo: p.codigo ?? null,
      cnpj: p.cnpj ?? null,
      email: p.email ?? null,
      contatos: p.contatos ?? p.contatosBean ?? [],
    }));
  return new Response(JSON.stringify(filtered), { headers: corsJson });
}
```

(`NOMUS_BASE`, `nomusHeaders`, `corsJson` — usar os identificadores já existentes no arquivo; se tiverem outro nome, adaptar.)

- [ ] **Step 2: Adicionar o case `tiposMovimentacao`**

```typescript
if (type === "tiposMovimentacao") {
  const termo = (body.query ?? "").trim();
  const url = `${NOMUS_BASE}/rest/tiposMovimentacao${termo ? `?query=${encodeURIComponent(`nome="*${termo}*"`)}` : ""}`;
  const resp = await fetch(url, { headers: nomusHeaders });
  const list = resp.ok ? await resp.json() : [];
  const filtered = (Array.isArray(list) ? list : [])
    .filter((t: any) => t?.natureza === 3) // 3 = Compra
    .map((t: any) => ({ codigo: t.codigo, nome: t.nome, natureza: t.natureza }));
  return new Response(JSON.stringify(filtered), { headers: corsJson });
}
```

- [ ] **Step 3: Confirmar CORS**

Garantir que os headers CORS da função incluem `apikey, x-client-info, authorization, content-type`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/nomus-search/index.ts
git commit -m "feat(compras): nomus-search suporta pessoas e tiposMovimentacao"
```

> Deploy da function: `supabase functions deploy nomus-search` (no deploy do projeto).

---

## Task 4: Hook `useNomusLookup`

**Files:**
- Create: `src/hooks/useNomusLookup.ts`

> Verificar no `ProductSearch.tsx` como ele invoca a function `nomus-search` (via `supabase.functions.invoke`) e replicar o mesmo mecanismo.

- [ ] **Step 1: Criar o hook**

```typescript
// src/hooks/useNomusLookup.ts
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NomusPessoa {
  id: number;
  nome: string;
  codigo: string | null;
  cnpj: string | null;
  email: string | null;
  contatos: any[];
}

export interface NomusTipoMov {
  codigo: number;
  nome: string;
  natureza: number;
}

async function callNomusSearch(payload: Record<string, unknown>): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke("nomus-search", { body: payload });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Busca pessoas (fornecedor/comprador) no Nomus com debounce. */
export function useNomusPessoas(termo: string, categoria: "fornecedor" | "comprador") {
  const [results, setResults] = useState<NomusPessoa[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (termo.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      callNomusSearch({ type: "pessoas", query: termo, categoria })
        .then((r) => { if (!cancelled) setResults(r as NomusPessoa[]); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [termo, categoria]);
  return { results, loading };
}

/** Busca tipos de movimentação (natureza Compra) no Nomus com debounce. */
export function useNomusTiposMovimentacao(termo: string) {
  const [results, setResults] = useState<NomusTipoMov[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      callNomusSearch({ type: "tiposMovimentacao", query: termo })
        .then((r) => { if (!cancelled) setResults(r as NomusTipoMov[]); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [termo]);
  return { results, loading };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useNomusLookup.ts
git commit -m "feat(compras): hook useNomusLookup (pessoas e tiposMovimentacao)"
```

---

## Task 5: Hooks `usePurchaseOrders` e `useSuppliers`

**Files:**
- Create: `src/hooks/usePurchaseOrders.ts`
- Create: `src/hooks/useSuppliers.ts`

> Seguir o padrão de `src/hooks/useQuotes.ts` (useQuery/useMutation + `invalidateQueries`).

- [ ] **Step 1: Criar `usePurchaseOrders.ts`**

```typescript
// src/hooks/usePurchaseOrders.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

const sb = supabase as any;

export function usePurchaseOrders(ticketId?: string | null) {
  return useQuery({
    queryKey: ["purchase-orders", ticketId ?? "all"],
    queryFn: async () => {
      let q = sb.from("purchase_orders").select("*").order("created_at", { ascending: false });
      if (ticketId) q = q.eq("ticket_id", ticketId);
      const { data, error } = await q;
      if (error) throw error;
      return data as PurchaseOrder[];
    },
  });
}

export function usePurchaseOrder(id?: string) {
  return useQuery({
    queryKey: ["purchase-order", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("purchase_orders").select("*").eq("id", id).single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
  });
}

export function usePurchaseOrderItems(purchaseOrderId?: string) {
  return useQuery({
    queryKey: ["purchase-order-items", purchaseOrderId],
    enabled: !!purchaseOrderId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", purchaseOrderId)
        .order("posicao", { ascending: true });
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ticket_id?: string | null; created_by?: string | null }) => {
      const { data: num } = await sb.rpc("generate_pc_number");
      const { data, error } = await sb
        .from("purchase_orders")
        .insert({ order_number: num ?? `PC-${Date.now()}`, ticket_id: input.ticket_id ?? null, created_by: input.created_by ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PurchaseOrder>) => {
      const { data, error } = await sb
        .from("purchase_orders")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-order", d.id] });
    },
  });
}

export function useAddPurchaseOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<PurchaseOrderItem>) => {
      const { data, error } = await sb.from("purchase_order_items").insert(item).select().single();
      if (error) throw error;
      return data as PurchaseOrderItem;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["purchase-order-items", d.purchase_order_id] }),
  });
}

export function useUpdatePurchaseOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PurchaseOrderItem>) => {
      const { data, error } = await sb.from("purchase_order_items").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as PurchaseOrderItem;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["purchase-order-items", d.purchase_order_id] }),
  });
}

export function useDeletePurchaseOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; purchase_order_id: string }) => {
      const { error } = await sb.from("purchase_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["purchase-order-items", vars.purchase_order_id] }),
  });
}
```

- [ ] **Step 2: Criar `useSuppliers.ts`**

```typescript
// src/hooks/useSuppliers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Supplier } from "@/types/purchaseOrder";

const sb = supabase as any;

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await sb.from("suppliers").select("*").order("nome", { ascending: true });
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useSupplierByNomusId(nomusPessoaId?: number | null) {
  return useQuery({
    queryKey: ["supplier-by-nomus", nomusPessoaId],
    enabled: !!nomusPessoaId,
    queryFn: async () => {
      const { data, error } = await sb.from("suppliers").select("*").eq("nomus_pessoa_id", nomusPessoaId).maybeSingle();
      if (error) throw error;
      return (data as Supplier) ?? null;
    },
  });
}

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Supplier> & { nomus_pessoa_id: number; nome: string }) => {
      const { data, error } = await sb
        .from("suppliers")
        .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "nomus_pessoa_id" })
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePurchaseOrders.ts src/hooks/useSuppliers.ts
git commit -m "feat(compras): hooks de purchase orders e suppliers"
```

---

## Task 6: Componente `NomusPessoaSearch`

**Files:**
- Create: `src/components/compras/NomusPessoaSearch.tsx`

Autocomplete reutilizável: recebe `categoria` e dispara `onSelect` com a pessoa escolhida.

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/compras/NomusPessoaSearch.tsx
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useNomusPessoas, type NomusPessoa } from "@/hooks/useNomusLookup";

interface Props {
  categoria: "fornecedor" | "comprador";
  value: string | null;            // nome atualmente selecionado
  onSelect: (pessoa: NomusPessoa) => void;
  placeholder?: string;
}

export function NomusPessoaSearch({ categoria, value, onSelect, placeholder }: Props) {
  const [termo, setTermo] = useState("");
  const [open, setOpen] = useState(false);
  const { results, loading } = useNomusPessoas(termo, categoria);

  return (
    <div className="relative">
      <Input
        value={open ? termo : (value ?? "")}
        placeholder={placeholder ?? `Buscar ${categoria}...`}
        onFocus={() => { setOpen(true); setTermo(""); }}
        onChange={(e) => setTermo(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (termo.trim().length >= 2) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-auto">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando...</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
              onMouseDown={() => { onSelect(p); setOpen(false); }}
            >
              {p.nome} {p.codigo ? <span className="text-xs text-muted-foreground">({p.codigo})</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/compras/NomusPessoaSearch.tsx
git commit -m "feat(compras): autocomplete NomusPessoaSearch"
```

---

## Task 7: Lib de payload do Nomus (lógica pura + teste)

**Files:**
- Create: `src/lib/buildPedidoCompraPayload.ts`
- Test: `src/lib/buildPedidoCompraPayload.test.ts`

- [ ] **Step 1: Escrever o teste**

```typescript
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm run test -- buildPedidoCompraPayload`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar a lib**

```typescript
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
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm run test -- buildPedidoCompraPayload`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/buildPedidoCompraPayload.ts src/lib/buildPedidoCompraPayload.test.ts
git commit -m "feat(compras): lib buildPedidoCompraPayload com teste"
```

---

## Task 8: Lib de geração de PDF

**Files:**
- Create: `src/lib/purchaseOrderPdf.ts`

> Reaproveitar o padrão de geração de PDF já usado no contrato do PD (procurar por `jsPDF` no projeto: `src/lib/` ou no `PDDetailPage`). Usar a mesma logo se disponível.

- [ ] **Step 1: Criar a lib**

```typescript
// src/lib/purchaseOrderPdf.ts
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

/** Gera o PDF da solicitação de cotação (sem preços) e retorna o documento jsPDF. */
export function buildPurchaseOrderPdf(po: PurchaseOrder, items: PurchaseOrderItem[]): jsPDF {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Solicitação de Cotação", 14, 20);
  doc.setFontSize(10);
  doc.text(`Pedido: ${po.order_number}`, 14, 30);
  doc.text(`Fornecedor: ${po.nomus_fornecedor_nome ?? "—"}`, 14, 36);
  doc.text(`Data: ${po.data_emissao ?? "—"}`, 14, 42);

  autoTable(doc, {
    startY: 50,
    head: [["#", "Produto", "Quantidade"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.produto_descricao ?? it.produto_codigo ?? "—",
      String(it.quantidade ?? 0),
    ]),
  });

  if (po.observacoes) {
    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Observações:", 14, y);
    doc.text(doc.splitTextToSize(po.observacoes, 180), 14, y + 6);
  }
  return doc;
}

/** Faz o download do PDF. */
export function downloadPurchaseOrderPdf(po: PurchaseOrder, items: PurchaseOrderItem[]): void {
  buildPurchaseOrderPdf(po, items).save(`${po.order_number}.pdf`);
}

/** Retorna o PDF como base64 (sem o prefixo data URI) para envio por e-mail. */
export function purchaseOrderPdfBase64(po: PurchaseOrder, items: PurchaseOrderItem[]): string {
  const dataUri = buildPurchaseOrderPdf(po, items).output("datauristring");
  return dataUri.split(",")[1] ?? "";
}
```

- [ ] **Step 2: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/purchaseOrderPdf.ts
git commit -m "feat(compras): geração de PDF da solicitação de cotação"
```

---

## Task 9: Componente `PurchaseOrderItemsTable`

**Files:**
- Create: `src/components/compras/PurchaseOrderItemsTable.tsx`

Tabela editável de itens. Recebe os itens e callbacks de update/delete.

- [ ] **Step 1: Criar o componente**

Props:
```typescript
interface Props {
  items: PurchaseOrderItem[];
  onUpdate: (id: string, updates: Partial<PurchaseOrderItem>) => void;
  onDelete: (id: string) => void;
  readOnly?: boolean;
}
```

Renderizar uma tabela (`<table>` com classes Tailwind ou os componentes `Table` de shadcn) com colunas: **Produto** (texto), **Qtd** (input number → `onUpdate(id,{quantidade})`), **Valor unit.** (input number → `valor_unitario`), **% Desc.** (input → `percentual_desconto`), **Valor desc.** (input → `valor_desconto`), **Un. medida** (input texto → `unidade_medida_label`), **Class. financeira** (input texto → `classificacao_financeira_label`), **Entrega** (input date → `data_entrega`), **Total** (calculado: `quantidade * valor_unitario - valor_desconto`, somente leitura), **Ação** (botão excluir → `onDelete(id)`).
Rodapé com o **Total geral** (soma dos totais de linha).
Quando `readOnly`, renderizar os valores como texto, sem inputs e sem botão excluir.

> Os campos de unidade de medida e classificação financeira ficam como input de texto editável nesta versão (endpoints GET do Nomus ainda sem documentação — Pendência 4 da spec). Quando os endpoints chegarem, vira autocomplete.

- [ ] **Step 2: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/compras/PurchaseOrderItemsTable.tsx
git commit -m "feat(compras): tabela editável de itens do pedido de compra"
```

---

## Task 10: Edge function `nomus-create-purchase-order`

**Files:**
- Create: `supabase/functions/nomus-create-purchase-order/index.ts`

> Usar `supabase/functions/nomus-search/index.ts` como referência de boilerplate (CORS, headers Nomus, leitura de env).

- [ ] **Step 1: Criar a function**

```typescript
// supabase/functions/nomus-create-purchase-order/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // `payload` é montado no browser via buildPedidoCompraPayload (Task 7)
    const { purchase_order_id, payload } = await req.json();
    if (!purchase_order_id || !payload) throw new Error("purchase_order_id e payload obrigatórios");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Defaults configuráveis injetados aqui (não vêm da tela)
    const fullPayload = {
      ...payload,
      idCondicaoPagamento: Number(Deno.env.get("NOMUS_PC_ID_CONDICAO_PAGAMENTO") ?? "1"),
      idFormaPagamento: Number(Deno.env.get("NOMUS_PC_ID_FORMA_PAGAMENTO") ?? "1"),
    };

    const nomusBase = Deno.env.get("NOMUS_BASE_URL")!;        // ex.: https://.../empresa
    const nomusAuth = Deno.env.get("NOMUS_API_KEY")!;          // chave Basic
    const resp = await fetch(`${nomusBase}/rest/pedidoscompra`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Basic ${nomusAuth}` },
      body: JSON.stringify(fullPayload),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Nomus ${resp.status}: ${text}`);
    const result = JSON.parse(text); // { codigoPedido, id }

    await supabase.from("purchase_orders").update({
      nomus_order_id: result.id,
      nomus_codigo_pedido: result.codigoPedido,
      nomus_sent_at: new Date().toISOString(),
      status: "criado_nomus",
      updated_at: new Date().toISOString(),
    }).eq("id", purchase_order_id);

    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

> Os nomes de env (`NOMUS_BASE_URL`, `NOMUS_API_KEY`) devem bater com os já usados pela function `nomus-search`. Verificar e ajustar.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/nomus-create-purchase-order/index.ts
git commit -m "feat(compras): edge function para criar pedido de compra no Nomus"
```

> Deploy: `supabase functions deploy nomus-create-purchase-order`.

---

## Task 11: Edge function `send-purchase-order-email`

**Files:**
- Create: `supabase/functions/send-purchase-order-email/index.ts`

- [ ] **Step 1: Criar a function**

```typescript
// supabase/functions/send-purchase-order-email/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { purchase_order_id, pdf_base64 } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: po } = await supabase
      .from("purchase_orders").select("*").eq("id", purchase_order_id).single();
    if (!po) throw new Error("Pedido não encontrado");

    // Resolve o destinatário: agenda local → e-mail do Nomus
    let destino: string | null = null;
    if (po.nomus_fornecedor_id) {
      const { data: sup } = await supabase
        .from("suppliers").select("email").eq("nomus_pessoa_id", po.nomus_fornecedor_id).maybeSingle();
      destino = sup?.email ?? null;
    }
    if (!destino) throw new Error("Fornecedor sem e-mail cadastrado na agenda");

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.hostinger.com",
        port: 465,
        tls: true,
        auth: {
          username: "compras@liveuniverse.com.br",
          password: Deno.env.get("COMPRAS_SMTP_PASSWORD")!,
        },
      },
    });

    await client.send({
      from: "compras@liveuniverse.com.br",
      to: destino,
      subject: `Solicitação de cotação — ${po.order_number}`,
      content: `Olá,\n\nSegue em anexo a solicitação de cotação ${po.order_number}.\n` +
               `Por favor, retorne com os valores.\n\nObrigado.\nSetor de Compras — Live`,
      attachments: pdf_base64
        ? [{ filename: `${po.order_number}.pdf`, content: pdf_base64, encoding: "base64", contentType: "application/pdf" }]
        : [],
    });
    await client.close();

    await supabase.from("purchase_orders").update({
      email_sent_at: new Date().toISOString(),
      email_to: destino,
      status: "enviado_fornecedor",
      updated_at: new Date().toISOString(),
    }).eq("id", purchase_order_id);

    return new Response(JSON.stringify({ ok: true, to: destino }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-purchase-order-email/index.ts
git commit -m "feat(compras): edge function de envio de e-mail ao fornecedor"
```

> **Antes do deploy**, o usuário define a senha SMTP:
> `supabase secrets set COMPRAS_SMTP_PASSWORD=...` (o usuário executa; a senha não passa pelo chat nem pelo código).
> Deploy: `supabase functions deploy send-purchase-order-email`.
> Verificar a versão de `denomailer` conforme o protocolo de segurança de dependências (cooldown 7 dias) antes de fixar.

---

## Task 12: Página `PCDetailPage`

**Files:**
- Create: `src/pages/PCDetailPage.tsx`

> **Template:** ler `src/pages/PADetailPage.tsx` e espelhar a estrutura (cabeçalho com número e status, layout em seções, navegação de volta com `?from_ticket=`). As diferenças estão abaixo.

- [ ] **Step 1: Estrutura base da página**

Componente de rota lendo `:id` via `useParams`. Carrega o pedido com `usePurchaseOrder(id)` e os itens com `usePurchaseOrderItems(id)`. Cabeçalho: `order_number` + `<Select>` de status (`PURCHASE_ORDER_STATUS_LABELS`) ligado a `useUpdatePurchaseOrder`.

- [ ] **Step 2: Seção "Informações gerais"**

Renderizar os 10 campos, cada um persistindo via `useUpdatePurchaseOrder` (debounce/`onBlur` para inputs de texto):
1. **Pedido** — `order_number`, somente leitura.
2. **Empresa** — input texto por enquanto, gravando `nomus_empresa_id`/`nomus_empresa_label` (vira autocomplete quando o endpoint chegar — Pendência 4).
3. **Fornecedor** — `<NomusPessoaSearch categoria="fornecedor" value={po.nomus_fornecedor_nome} onSelect={p => update({ nomus_fornecedor_id: p.id, nomus_fornecedor_nome: p.nome })} />`.
4. **Tipo de movimentação** — autocomplete usando `useNomusTiposMovimentacao`; ao escolher, grava `nomus_tipo_movimentacao_id` (= `codigo`) e `_label` (= `nome`).
5. **Data de emissão** — `<input type="date">` → `data_emissao`.
6. **Data de entrega padrão** — `<input type="date">` → `data_entrega_padrao`.
7. **Contato** — input texto → `nomus_contato_label`.
8. **Comprador** — `<NomusPessoaSearch categoria="comprador" value={po.nomus_comprador_nome} onSelect={p => update({ nomus_comprador_id: p.id, nomus_comprador_nome: p.nome })} />`.
9. **Condição de pagamento** — input texto → `condicao_pagamento`.
10. **Observações** — `<textarea>` → `observacoes`.

- [ ] **Step 3: Seção "Itens do pedido de compra"**

- `ProductSearch` existente para buscar produtos Nomus; ao selecionar, chamar `useAddPurchaseOrderItem` com `purchase_order_id`, `nomus_produto_id`, `produto_codigo`, `produto_descricao`, `posicao` (= itens.length + 1).
- `<PurchaseOrderItemsTable items={items} onUpdate={...} onDelete={...} />` ligado a `useUpdatePurchaseOrderItem`/`useDeletePurchaseOrderItem`.

- [ ] **Step 4: Barra de ações (4 botões)**

- **Gerar PDF** → `downloadPurchaseOrderPdf(po, items)`.
- **Enviar email PC** → `purchaseOrderPdfBase64(po, items)` e `supabase.functions.invoke("send-purchase-order-email", { body: { purchase_order_id: po.id, pdf_base64 } })`; em sucesso, `toast` e invalidar `["purchase-order", id]`.
- **Importar orçamento** → `<input type="file" accept=".pdf">`; upload para o bucket `compras-orcamentos` (path `pc/${po.id}/${Date.now()}_${nome}`), pegar URL pública, `useUpdatePurchaseOrder` com `supplier_quote_pdf_url`, `supplier_quote_uploaded_at`, `status: "orcamento_recebido"`. Se já houver PDF, mostrar link "Abrir orçamento".
- **Criar pedido na Nomus** → montar o payload com `buildPedidoCompraPayload(po, items)` e `supabase.functions.invoke("nomus-create-purchase-order", { body: { purchase_order_id: po.id, payload } })`; em sucesso, `toast` com `codigoPedido` e invalidar `["purchase-order", id]`.

Cada ação mostra `toast.success`/`toast.error` (lib `sonner`, padrão do projeto).

- [ ] **Step 5: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PCDetailPage.tsx
git commit -m "feat(compras): página de detalhe do Pedido de Compra"
```

---

## Task 13: Página `PedidosCompraPage`

**Files:**
- Create: `src/pages/PedidosCompraPage.tsx`

> **Template:** espelhar `src/pages/PedidosAcessoriosPage.tsx`.

- [ ] **Step 1: Criar a página**

Lista usando `usePurchaseOrders()` (sem `ticketId` → todos). Tabela/cards com: `order_number`, fornecedor (`nomus_fornecedor_nome`), status (badge com `PURCHASE_ORDER_STATUS_LABELS`), data de criação. Linha clicável → `navigate(\`/pedidos-compra/${po.id}\`)`. Campo de busca por número/fornecedor e filtro por status (client-side).

- [ ] **Step 2: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PedidosCompraPage.tsx
git commit -m "feat(compras): página de lista de Pedidos de Compra"
```

---

## Task 14: Página `FornecedoresPage`

**Files:**
- Create: `src/pages/FornecedoresPage.tsx`

- [ ] **Step 1: Criar a página**

- Lista de `useSuppliers()`: tabela com nome, e-mail, telefone, contato, ativo.
- Botão "Adicionar fornecedor" → abre um `Dialog` com:
  - `<NomusPessoaSearch categoria="fornecedor" />` para escolher a pessoa do Nomus (preenche `nomus_pessoa_id` + `nome`; se o Nomus trouxer `email`, pré-preenche).
  - Inputs: e-mail, telefone, contato, observações.
  - Salvar → `useUpsertSupplier`.
- Editar (mesmo dialog, pré-preenchido) e excluir (`useDeleteSupplier`, com confirmação).

- [ ] **Step 2: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/FornecedoresPage.tsx
git commit -m "feat(compras): página de agenda de fornecedores"
```

---

## Task 15: Aba "Ped. Compras" no `TicketDetailDialog`

**Files:**
- Modify: `src/components/tickets/TicketDetailDialog.tsx`

> **Template:** copiar exatamente o padrão da aba "Ped. Acessórios" (`TabsTrigger value="client-services"` e seu `TabsContent`). Ler esses trechos antes de editar.

- [ ] **Step 1: Adicionar o `TabsTrigger`**

Após o `TabsTrigger` de "Ped. Acessórios", adicionar:

```tsx
<TabsTrigger value="purchase-orders" className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 pb-2 gap-1">
  <ShoppingCart className="h-3 w-3" /> Ped. Compras ({purchaseOrders?.length || 0})
</TabsTrigger>
```

Importar `ShoppingCart` de `lucide-react`.

- [ ] **Step 2: Carregar os dados**

Junto dos outros hooks do componente, adicionar:
```tsx
const { data: purchaseOrders } = usePurchaseOrders(ticket?.id);
```
Importar `usePurchaseOrders` e `useCreatePurchaseOrder`.

- [ ] **Step 3: Adicionar o `TabsContent`**

```tsx
<TabsContent value="purchase-orders" className="mt-0 space-y-3">
  <div className="flex items-center justify-between">
    <span className="text-xs font-semibold">Pedidos de Compra</span>
    <Button size="sm" onClick={async () => {
      const po = await createPurchaseOrder.mutateAsync({ ticket_id: ticket.id, created_by: user?.id });
      onOpenChange(false);
      setTimeout(() => navigate(`/pedidos-compra/${po.id}?from_ticket=${ticket.id}`), 150);
    }}>
      Criar Pedido de Compras
    </Button>
  </div>
  <div className="rounded-lg border divide-y">
    {(purchaseOrders ?? []).map((po) => (
      <div key={po.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
        <span className="text-xs font-mono font-semibold flex-1">{po.order_number}</span>
        <span className="text-[10px] text-muted-foreground">{po.nomus_fornecedor_nome ?? "—"}</span>
        <span className="text-[10px]">{PURCHASE_ORDER_STATUS_LABELS[po.status]}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6"
          onClick={() => { onOpenChange(false); navigate(`/pedidos-compra/${po.id}?from_ticket=${ticket.id}`); }}>
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    ))}
    {(purchaseOrders ?? []).length === 0 && (
      <div className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum pedido de compra</div>
    )}
  </div>
</TabsContent>
```

Declarar `const createPurchaseOrder = useCreatePurchaseOrder();`. Importar `PURCHASE_ORDER_STATUS_LABELS`.

- [ ] **Step 4: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/components/tickets/TicketDetailDialog.tsx
git commit -m "feat(compras): aba Ped. Compras no card do ticket"
```

---

## Task 16: Rotas, menu lateral e permissões

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppSidebar.tsx`
- Modify: `src/lib/crmModules.ts`

> Regra obrigatória do `CLAUDE.md`: todo item de sidebar com controle de acesso precisa de `moduleKey` E entrada correspondente em `crmModules.ts`.

- [ ] **Step 1: Rotas em `App.tsx`**

Adicionar os lazy imports e as rotas (seguir o padrão dos imports lazy existentes):
```tsx
const PedidosCompraPage = lazy(() => import("./pages/PedidosCompraPage"));
const PCDetailPage = lazy(() => import("./pages/PCDetailPage"));
const FornecedoresPage = lazy(() => import("./pages/FornecedoresPage"));
```
```tsx
<Route path="/pedidos-compra" element={<PedidosCompraPage />} />
<Route path="/pedidos-compra/:id" element={<PCDetailPage />} />
<Route path="/fornecedores" element={<FornecedoresPage />} />
```
> Confirmar se as páginas usam `export default` — os lazy imports exigem default export. Ajustar as Tasks 12-14 para `export default function ...` se necessário.

- [ ] **Step 2: Itens no `AppSidebar.tsx`**

No array `operationsNav`, adicionar dois itens (seguir o shape dos itens existentes — `title`, `url`, `icon`, `moduleKey`):
```tsx
{ title: "Pedidos de Compra", url: "/pedidos-compra", icon: ShoppingCart, moduleKey: "pedidos_compra" },
{ title: "Fornecedores", url: "/fornecedores", icon: Truck, moduleKey: "fornecedores" },
```
Importar `ShoppingCart` e `Truck` de `lucide-react`.

- [ ] **Step 3: Entradas em `crmModules.ts`**

Na seção `"Operações"`, adicionar as duas keys:
```tsx
{ key: "pedidos_compra", label: "Pedidos de Compra" },
{ key: "fornecedores", label: "Fornecedores" },
```
> Conferir o shape exato dos itens existentes em `crmModules.ts` e replicar.

- [ ] **Step 4: Verificar typecheck e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/AppSidebar.tsx src/lib/crmModules.ts
git commit -m "feat(compras): rotas, menu lateral e permissões do módulo de compras"
```

---

## Verificação final

- [ ] `npx tsc --noEmit` — sem erros.
- [ ] `npm run build` — sucesso.
- [ ] `npm run test` — testes passam.
- [ ] Migration aplicada no Supabase; `SELECT public.generate_pc_number();` retorna `PC.26.001`.
- [ ] Edge functions deployadas: `nomus-search`, `nomus-create-purchase-order`, `send-purchase-order-email`.
- [ ] Secret `COMPRAS_SMTP_PASSWORD` configurada pelo usuário.
- [ ] Teste manual: criar PC pelo card → preencher campos → adicionar itens → gerar PDF → importar orçamento → criar na Nomus.
- [ ] Admin libera os módulos `pedidos_compra` e `fornecedores` em `/crm-permissions`.

---

## Pendências herdadas da spec (não bloqueiam)

- Endpoint de busca de `pessoas` por `query` — assumido `query=nome="*TERMO*"`; validar no 1º teste.
- Endpoints GET de empresas, unidades de medida, classificações financeiras — esses campos ficam como input de texto até a documentação chegar.
- `idCondicaoPagamento` / `idFormaPagamento` — usam defaults via env na edge function; confirmar valores reais.
- `idTipoPedidoCompra` / `idSetorEntrada` — omitidos do POST; validar se a API aceita sem eles.
