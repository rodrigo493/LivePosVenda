# Motivos de Perda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar sistema completo de rastreamento de motivos de perda: tabela de gestão (/motivos-perda), seletor multi-chip no card de ticket, e widget KPI no dashboard.

**Architecture:** Duas novas tabelas (`loss_reasons` + `ticket_loss_reasons`) com view materializada para contagens. Hooks centralizados em `src/hooks/useLossReasons.ts`. Página de gestão autônoma, tab adicionada ao TicketDetailDialog existente, e widget inserido no Dashboard.

**Tech Stack:** React + TypeScript, Supabase (PostgREST + RLS), TanStack Query, Tailwind CSS, shadcn/ui (Tabs, Button, Badge, Input), Lucide React.

---

## File Structure

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| CREATE | `supabase/migrations/20260502000020_loss_reasons.sql` | Tabelas, view, RLS, seed |
| CREATE | `src/hooks/useLossReasons.ts` | Todos os hooks de motivos de perda |
| CREATE | `src/pages/MotivosPerdaPage.tsx` | Página de gestão CRUD |
| MODIFY | `src/App.tsx` | Lazy import + route `/motivos-perda` |
| MODIFY | `src/components/layout/AppSidebar.tsx` | Item de nav "Motivos de Perda" |
| MODIFY | `src/components/tickets/TicketDetailDialog.tsx` | Nova aba com chips |
| CREATE | `src/components/dashboard/LossReasonsWidget.tsx` | Widget KPI do dashboard |
| MODIFY | `src/pages/Dashboard.tsx` | Importar e renderizar o widget |

---

## Task 1: Migration — Tabelas, View, RLS e Seed

**Files:**
- Create: `supabase/migrations/20260502000020_loss_reasons.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260502000020_loss_reasons.sql

-- 1. Tabela de catálogo de motivos
CREATE TABLE public.loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabela de vínculo N:N ticket ↔ motivo
CREATE TABLE public.ticket_loss_reasons (
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  loss_reason_id UUID NOT NULL REFERENCES public.loss_reasons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, loss_reason_id)
);

-- 3. View com contagem de tickets por motivo
CREATE OR REPLACE VIEW public.loss_reasons_with_count AS
SELECT
  lr.id,
  lr.label,
  lr.active,
  lr.position,
  lr.created_at,
  COUNT(tlr.ticket_id)::INTEGER AS ticket_count
FROM public.loss_reasons lr
LEFT JOIN public.ticket_loss_reasons tlr ON lr.id = tlr.loss_reason_id
GROUP BY lr.id;

-- 4. RLS para loss_reasons
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loss_reasons_select" ON public.loss_reasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "loss_reasons_insert" ON public.loss_reasons
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "loss_reasons_update" ON public.loss_reasons
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 5. RLS para ticket_loss_reasons
ALTER TABLE public.ticket_loss_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ticket_loss_reasons_select" ON public.ticket_loss_reasons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "ticket_loss_reasons_insert" ON public.ticket_loss_reasons
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ticket_loss_reasons_delete" ON public.ticket_loss_reasons
  FOR DELETE TO authenticated USING (true);

-- 6. Grants
GRANT SELECT ON public.loss_reasons_with_count TO authenticated;

-- 7. Seed — 20 motivos padrão
INSERT INTO public.loss_reasons (label, position) VALUES
  ('Cliente acha que não é o momento', 1),
  ('Cliente não avançou por dependência de terceiros', 2),
  ('Cliente optou por adiar a decisão sem justificativa clara', 3),
  ('Cliente quer muito o(s) equipamento(s), mas não tem dinheiro', 4),
  ('Condição de pagamento não atendeu', 5),
  ('Duplicidade de cadastro', 6),
  ('Duplicidade de negociação', 7),
  ('Falta de dados para contato', 8),
  ('Falta de espaço', 9),
  ('Fechou com o concorrente', 10),
  ('Frete elevado', 11),
  ('Interagiu inicialmente, mas deixou de responder', 12),
  ('Lead buscou por equipamentos que não é portfólio da empresa', 13),
  ('Lead desqualificado', 14),
  ('Lead sem engajamento desde que entrou', 15),
  ('Não conseguiu financiamento', 16),
  ('Prazo de entrega não atende', 17),
  ('Preço acima do esperado', 18),
  ('Produto não atende', 19),
  ('Sem interação após envio da proposta', 20);
```

- [ ] **Step 2: Aplicar a migration no Supabase**

```bash
cd C:/VS_CODE/LivePosVenda
npx supabase db push
```

Saída esperada: `Applying migration 20260502000020_loss_reasons.sql...` sem erros.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260502000020_loss_reasons.sql
git commit -m "feat(motivos-perda): migration loss_reasons + ticket_loss_reasons + seed"
```

---

## Task 2: Hooks — useLossReasons.ts

**Files:**
- Create: `src/hooks/useLossReasons.ts`

- [ ] **Step 1: Criar o arquivo de hooks**

```typescript
// src/hooks/useLossReasons.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface LossReason {
  id: string;
  label: string;
  active: boolean;
  position: number;
  created_at: string;
  ticket_count?: number;
}

export interface TicketLossReason {
  ticket_id: string;
  loss_reason_id: string;
  created_at: string;
}

// ── useLossReasons ────────────────────────────────────────────────────────────
// Todos os motivos (ativos + inativos) com contagem — para página de gestão

export function useLossReasons() {
  return useQuery<LossReason[]>({
    queryKey: ["loss-reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loss_reasons_with_count")
        .select("id, label, active, position, created_at, ticket_count")
        .order("active", { ascending: false })
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useLossReasonsActive ──────────────────────────────────────────────────────
// Apenas ativos, sem contagem — para o seletor de chips no card de ticket

export function useLossReasonsActive() {
  return useQuery<LossReason[]>({
    queryKey: ["loss-reasons-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loss_reasons")
        .select("id, label, active, position, created_at")
        .eq("active", true)
        .order("label");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useLossReasonsStats ───────────────────────────────────────────────────────
// Top 10 com count > 0, ordenados decrescente — para o widget do dashboard

export function useLossReasonsStats() {
  return useQuery<LossReason[]>({
    queryKey: ["loss-reasons-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loss_reasons_with_count")
        .select("id, label, ticket_count")
        .gt("ticket_count", 0)
        .order("ticket_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useTicketLossReasons ──────────────────────────────────────────────────────
// Motivos vinculados a um ticket específico

export function useTicketLossReasons(ticketId: string | undefined) {
  return useQuery<TicketLossReason[]>({
    queryKey: ["ticket-loss-reasons", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_loss_reasons")
        .select("ticket_id, loss_reason_id, created_at")
        .eq("ticket_id", ticketId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── useCreateLossReason ───────────────────────────────────────────────────────

export function useCreateLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const { error } = await supabase
        .from("loss_reasons")
        .insert({ label: label.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loss-reasons"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-active"] });
    },
  });
}

// ── useUpdateLossReason ───────────────────────────────────────────────────────

export function useUpdateLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<LossReason, "label" | "active">> }) => {
      const { error } = await supabase
        .from("loss_reasons")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loss-reasons"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-active"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-stats"] });
    },
  });
}

// ── useToggleLossReason ───────────────────────────────────────────────────────
// INSERT se não selecionado, DELETE se já selecionado

export function useToggleLossReason(ticketId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reasonId, isSelected }: { reasonId: string; isSelected: boolean }) => {
      if (!ticketId) return;
      if (isSelected) {
        const { error } = await supabase
          .from("ticket_loss_reasons")
          .delete()
          .eq("ticket_id", ticketId)
          .eq("loss_reason_id", reasonId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ticket_loss_reasons")
          .insert({ ticket_id: ticketId, loss_reason_id: reasonId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-loss-reasons", ticketId] });
      qc.invalidateQueries({ queryKey: ["loss-reasons-stats"] });
      qc.invalidateQueries({ queryKey: ["loss-reasons"] });
    },
  });
}
```

- [ ] **Step 2: Verificar que o TypeScript compila**

```bash
cd C:/VS_CODE/LivePosVenda
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros relacionados a `useLossReasons.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLossReasons.ts
git commit -m "feat(motivos-perda): hooks useLossReasons, useToggleLossReason, stats"
```

---

## Task 3: Página de Gestão — MotivosPerdaPage.tsx

**Files:**
- Create: `src/pages/MotivosPerdaPage.tsx`

- [ ] **Step 1: Criar a página**

```tsx
// src/pages/MotivosPerdaPage.tsx
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, X, Plus, TrendingDown, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useLossReasons,
  useCreateLossReason,
  useUpdateLossReason,
} from "@/hooks/useLossReasons";

export default function MotivosPerdaPage() {
  const { data: reasons, isLoading } = useLossReasons();
  const createReason = useCreateLossReason();
  const updateReason = useUpdateLossReason();

  const [isCreating, setIsCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  async function handleCreate() {
    if (!newLabel.trim()) return;
    try {
      await createReason.mutateAsync(newLabel.trim());
      toast.success("Motivo criado com sucesso.");
      setNewLabel("");
      setIsCreating(false);
    } catch {
      toast.error("Erro ao criar motivo.");
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editingLabel.trim()) return;
    try {
      await updateReason.mutateAsync({ id, updates: { label: editingLabel.trim() } });
      toast.success("Motivo atualizado.");
      setEditingId(null);
    } catch {
      toast.error("Erro ao atualizar motivo.");
    }
  }

  async function handleToggleActive(id: string, currentActive: boolean) {
    try {
      await updateReason.mutateAsync({ id, updates: { active: !currentActive } });
      toast.success(currentActive ? "Motivo desativado." : "Motivo reativado.");
    } catch {
      toast.error("Erro ao alterar status.");
    }
  }

  const activeReasons = (reasons ?? []).filter((r) => r.active);
  const inactiveReasons = (reasons ?? []).filter((r) => !r.active);

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      <PageHeader
        title="Motivos de Perda"
        description="Gerencie os motivos de perda de negociações. Esses motivos são selecionáveis dentro de cada card de ticket."
        icon={TrendingDown}
      />

      {/* Botão + form de criação */}
      <div>
        {!isCreating ? (
          <Button size="sm" onClick={() => setIsCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo motivo
          </Button>
        ) : (
          <div className="flex gap-2 items-center">
            <Input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setIsCreating(false); setNewLabel(""); } }}
              placeholder="Ex: Preço acima do esperado"
              className="max-w-md h-9 text-sm"
            />
            <Button size="sm" onClick={handleCreate} disabled={createReason.isPending || !newLabel.trim()} className="gap-1">
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setIsCreating(false); setNewLabel(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Lista de motivos ativos */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Ativos ({activeReasons.length})
            </p>
            {activeReasons.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">Nenhum motivo ativo.</p>
            )}
            {activeReasons.map((reason) => (
              <div
                key={reason.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5 hover:bg-muted/40 transition-colors"
              >
                {editingId === reason.id ? (
                  <>
                    <Input
                      autoFocus
                      value={editingLabel}
                      onChange={(e) => setEditingLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(reason.id); if (e.key === "Escape") setEditingId(null); }}
                      className="h-7 text-sm flex-1 max-w-md"
                    />
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleSaveEdit(reason.id)} disabled={updateReason.isPending}>
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{reason.label}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {reason.ticket_count ?? 0} {(reason.ticket_count ?? 0) === 1 ? "negociação" : "negociações"}
                    </Badge>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2"
                      onClick={() => { setEditingId(reason.id); setEditingLabel(reason.label); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-destructive"
                      onClick={() => handleToggleActive(reason.id, reason.active)}
                      title="Desativar"
                    >
                      <PowerOff className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Lista de inativos */}
          {inactiveReasons.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Inativos ({inactiveReasons.length})
              </p>
              {inactiveReasons.map((reason) => (
                <div
                  key={reason.id}
                  className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-2.5"
                >
                  <span className="flex-1 text-sm text-muted-foreground line-through">{reason.label}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {reason.ticket_count ?? 0} {(reason.ticket_count ?? 0) === 1 ? "negociação" : "negociações"}
                  </Badge>
                  <Button
                    size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground hover:text-green-600"
                    onClick={() => handleToggleActive(reason.id, reason.active)}
                    title="Reativar"
                  >
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "MotivosPerdaPage" | head -10
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MotivosPerdaPage.tsx
git commit -m "feat(motivos-perda): página de gestão CRUD MotivosPerdaPage"
```

---

## Task 4: Rota e Navegação

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Adicionar lazy import e rota em App.tsx**

Em `src/App.tsx`, após a linha:
```tsx
const RdStationPage = lazy(() => import("./pages/RdStationPage"));
```
Adicionar:
```tsx
const MotivosPerdaPage = lazy(() => import("./pages/MotivosPerdaPage"));
```

Dentro do `<Routes>`, após:
```tsx
<Route path="/integracoes/rd-station" element={<RdStationPage />} />
```
Adicionar:
```tsx
<Route path="/motivos-perda" element={<MotivosPerdaPage />} />
```

- [ ] **Step 2: Adicionar item de nav no AppSidebar.tsx**

Em `src/components/layout/AppSidebar.tsx`, o import de lucide já tem muitos ícones. Adicionar `TrendingDown` à lista de imports existente:

```tsx
import {
  // ... todos os imports existentes ...
  TrendingDown,
} from "lucide-react";
```

No array `mainNav` (linha ~51), após o item `"CRM Pipeline"`:
```tsx
{ title: "Motivos de Perda", url: "/motivos-perda", icon: TrendingDown, moduleKey: null },
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i "motivos\|AppSidebar\|App.tsx" | head -10
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/AppSidebar.tsx
git commit -m "feat(motivos-perda): rota /motivos-perda + item de nav no sidebar"
```

---

## Task 5: Tab no TicketDetailDialog

**Files:**
- Modify: `src/components/tickets/TicketDetailDialog.tsx`

- [ ] **Step 1: Adicionar imports de hooks e ícone**

Em `src/components/tickets/TicketDetailDialog.tsx`, na linha 8 onde ficam os imports do lucide-react, adicionar `XCircle` à lista:

```tsx
import {
  Clock, User, Tag, FileText, MessageSquare, Calendar, Package,
  AlertTriangle, Send, Pencil, Check, X, Wrench, Shield, ClipboardList,
  ExternalLink, Receipt, Settings2, ArrowLeft, Cpu, Plus, ChevronDown, History, CheckSquare, Brain,
  BookOpen, Upload, Trash2, MoreVertical, Copy, PauseCircle, PlayCircle,
  ShoppingCart, Search, Minus, XCircle,
} from "lucide-react";
```

Após os imports de hooks existentes (perto da linha 51), adicionar:
```tsx
import {
  useLossReasonsActive,
  useTicketLossReasons,
  useToggleLossReason,
} from "@/hooks/useLossReasons";
```

- [ ] **Step 2: Adicionar chamadas dos hooks no corpo do componente**

Dentro da função `TicketDetailDialog` (após as chamadas de hooks existentes, perto da linha 200+), adicionar:

```tsx
const { data: allLossReasons } = useLossReasonsActive();
const { data: ticketLossReasons } = useTicketLossReasons(ticket?.id);
const toggleLossReason = useToggleLossReason(ticket?.id);
```

- [ ] **Step 3: Adicionar TabsTrigger**

Após o separador antes do tab "whatsapp" (linha ~1346):
```tsx
<div className="h-5 w-px bg-border mx-2 self-center" />

<TabsTrigger value="whatsapp" ...>
```

Inserir o novo tab trigger **antes** do separador final, depois do tab `negociacao-produtos`:

```tsx
<TabsTrigger
  value="loss-reasons"
  className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-destructive data-[state=active]:shadow-none px-3 pb-2 gap-1 data-[state=active]:text-destructive"
>
  <XCircle className="h-3 w-3" />
  Mot. de Perda
  {(ticketLossReasons?.length ?? 0) > 0 && (
    <span className="ml-0.5 rounded-full bg-destructive text-white text-[9px] font-bold px-1.5 py-px">
      {ticketLossReasons!.length}
    </span>
  )}
</TabsTrigger>
```

- [ ] **Step 4: Adicionar TabsContent**

Dentro do `<div className="px-6 pb-8 pt-4">` onde ficam os TabsContent (após o último TabsContent existente do "whatsapp"), adicionar:

```tsx
{/* ── Tab: Motivos de Perda ──── */}
<TabsContent value="loss-reasons" className="mt-0">
  <div className="space-y-4">
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      Selecione os motivos de perda desta negociação
    </p>
    {!allLossReasons || allLossReasons.length === 0 ? (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Nenhum motivo cadastrado.{" "}
        <a href="/motivos-perda" className="underline">Cadastrar motivos</a>
      </p>
    ) : (
      <div className="flex flex-wrap gap-2 pt-1">
        {allLossReasons.map((reason) => {
          const isSelected = ticketLossReasons?.some((r) => r.loss_reason_id === reason.id) ?? false;
          const isPending =
            toggleLossReason.isPending &&
            (toggleLossReason.variables as any)?.reasonId === reason.id;
          return (
            <button
              key={reason.id}
              onClick={() =>
                toggleLossReason.mutate({ reasonId: reason.id, isSelected })
              }
              disabled={isPending}
              className={[
                "text-xs rounded-full px-3 py-1.5 border transition-colors select-none",
                isSelected
                  ? "bg-destructive/10 border-destructive text-destructive font-medium"
                  : "bg-background border-border text-muted-foreground hover:border-destructive/50 hover:text-foreground",
                isPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              ].join(" ")}
            >
              {isPending ? "..." : reason.label}
            </button>
          );
        })}
      </div>
    )}
  </div>
</TabsContent>
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "TicketDetailDialog" | head -10
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/tickets/TicketDetailDialog.tsx
git commit -m "feat(motivos-perda): tab 'Mot. de Perda' com chips multi-seleção no card"
```

---

## Task 6: Widget do Dashboard

**Files:**
- Create: `src/components/dashboard/LossReasonsWidget.tsx`
- Modify: `src/pages/Dashboard.tsx`

- [ ] **Step 1: Criar o componente LossReasonsWidget**

```tsx
// src/components/dashboard/LossReasonsWidget.tsx
import { TrendingDown } from "lucide-react";
import { useLossReasonsStats } from "@/hooks/useLossReasons";

export function LossReasonsWidget() {
  const { data: stats, isLoading } = useLossReasonsStats();

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-4 w-4 text-destructive" />
        <h2 className="text-sm font-semibold text-foreground">Principais Motivos de Perda</h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 animate-pulse h-20" />
          ))}
        </div>
      ) : !stats || stats.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma negociação perdida registrada ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {stats.map((reason) => (
            <div
              key={reason.id}
              className="rounded-lg border bg-card p-3 flex flex-col gap-1 hover:bg-destructive/5 transition-colors"
            >
              <span className="text-2xl font-bold text-destructive leading-none">
                {reason.ticket_count}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                {reason.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Importar e renderizar no Dashboard.tsx**

Em `src/pages/Dashboard.tsx`, adicionar o import junto aos outros widgets (perto da linha 27):

```tsx
import { LossReasonsWidget } from "@/components/dashboard/LossReasonsWidget";
```

Dentro do JSX da função `DashboardContent` (ou a função interna), após o bloco `{/* IA */}` (perto da linha 705):

```tsx
{/* Motivos de Perda */}
<LossReasonsWidget />
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -i "LossReasons\|Dashboard" | head -10
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/LossReasonsWidget.tsx src/pages/Dashboard.tsx
git commit -m "feat(motivos-perda): widget KPI no dashboard ordenado por frequência"
```

---

## Verificação Final

- [ ] Abrir `/motivos-perda` — lista os 20 motivos com contagem, criar/editar/desativar funciona
- [ ] Abrir um card de ticket — aba "Mot. de Perda" aparece no final dos tabs, chips clicáveis, badge atualiza
- [ ] Selecionar motivos em um ticket e verificar que o badge do tab mostra o número correto
- [ ] Abrir o Dashboard — seção "Principais Motivos de Perda" aparece com os cards KPI
- [ ] Verificar que motivos desativados não aparecem no seletor do ticket (mas aparecem na página de gestão como inativos)

```bash
npx tsc --noEmit && npm run lint
```
