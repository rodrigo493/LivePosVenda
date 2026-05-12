# Status da Negociação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar sistema de "Status da Negociação" com dropdown de filtro com ícones no fluxo, seletor dentro do card e tag colorida na capa do kanban.

**Architecture:** Enum `vendido` adicionado ao PostgreSQL via migration; `STATUS_CONFIG` unificado em `CrmPipelinePage.tsx` serve o filtro, o card tag e os labels; `TicketDetailDialog.tsx` recebe um `<Select>` de status que persiste via mutation.

**Tech Stack:** React, TypeScript, Supabase, Lucide React, shadcn/ui (DropdownMenu, Select)

---

### Task 1: DB Migration — adicionar 'vendido' ao enum

**Files:**
- Create: `supabase/migrations/20260511200001_add_vendido_ticket_status.sql`

- [ ] Criar o arquivo de migration:

```sql
-- supabase/migrations/20260511200001_add_vendido_ticket_status.sql
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'vendido';
```

- [ ] Aplicar no banco de produção:

```bash
npx supabase db push
```

- [ ] Commit:

```bash
git add supabase/migrations/20260511200001_add_vendido_ticket_status.sql
git commit -m "feat(status): adicionar valor 'vendido' ao enum ticket_status"
```

---

### Task 2: Atualizar tipos TypeScript e statusLabels

**Files:**
- Modify: `src/integrations/supabase/types.ts` (linha ~2675)
- Modify: `src/constants/statusLabels.ts`

- [ ] Em `types.ts`, adicionar `"vendido"` ao tipo `ticket_status`:

```ts
ticket_status:
  | "aberto"
  | "em_analise"
  | "aguardando_informacoes"
  | "aguardando_peca"
  | "agendado"
  | "em_atendimento"
  | "aprovado"
  | "reprovado"
  | "resolvido"
  | "fechado"
  | "cancelado"
  | "pausado"
  | "vendido"   // ← adicionar esta linha
```

Também em `Enums` (linha ~2866):
```ts
ticket_status: [
  // ... existentes ...
  "vendido",
]
```

- [ ] Em `statusLabels.ts`, adicionar entrada:

```ts
export const ticketStatusLabels: Record<string, string> = {
  aberto: "Aberto",
  // ... existentes ...
  vendido: "Vendido",   // ← adicionar
};
```

- [ ] Commit:

```bash
git add src/integrations/supabase/types.ts src/constants/statusLabels.ts
git commit -m "feat(status): adicionar tipo 'vendido' ao TypeScript"
```

---

### Task 3: STATUS_CONFIG + novos ícones em CrmPipelinePage

**Files:**
- Modify: `src/pages/CrmPipelinePage.tsx` (imports + constante STATUS_LABELS)

- [ ] Adicionar ícones ao import do lucide (linha 3–23):

```ts
import {
  // ... existentes ...
  ThumbsUp,
  ThumbsDown,
  Pause,
  PersonStanding,
  ClipboardCheck,
} from "lucide-react";
```

- [ ] Substituir `STATUS_LABELS` (linha ~1360) por `STATUS_CONFIG`:

```ts
import type { LucideIcon } from "lucide-react";

interface StatusConfig { label: string; dot: string; Icon: LucideIcon; tagClass: string; }

const STATUS_CONFIG: Record<string, StatusConfig> = {
  aberto:    { label: "Em andamento", dot: "#3b82f6", Icon: PersonStanding, tagClass: "bg-blue-900/60 text-blue-300 border-blue-700/50" },
  vendido:   { label: "Vendido",      dot: "#22c55e", Icon: ThumbsUp,       tagClass: "bg-green-900/60 text-green-300 border-green-700/50" },
  cancelado: { label: "Perdido",      dot: "#ef4444", Icon: ThumbsDown,     tagClass: "bg-red-900/60 text-red-300 border-red-700/50" },
  pausado:   { label: "Pausado",      dot: "#f97316", Icon: Pause,          tagClass: "bg-orange-900/60 text-orange-300 border-orange-700/50" },
  fechado:   { label: "Vendido",      dot: "#22c55e", Icon: ThumbsUp,       tagClass: "bg-green-900/60 text-green-300 border-green-700/50" },
};
const STATUS_FALLBACK: StatusConfig = { label: "—", dot: "#71717a", Icon: PersonStanding, tagClass: "bg-zinc-700/60 text-zinc-400 border-zinc-600/50" };
```

- [ ] Atualizar a linha onde `statusInfo` era calculado no `PipelineCard` (~1600):

```ts
const statusInfo = STATUS_CONFIG[ticket.status] ?? STATUS_FALLBACK;
```

- [ ] Commit:

```bash
git add src/pages/CrmPipelinePage.tsx
git commit -m "feat(status): STATUS_CONFIG unificado com ícones Lucide"
```

---

### Task 4: Redesenhar dropdown de filtro com ícones

**Files:**
- Modify: `src/pages/CrmPipelinePage.tsx` (dropdown na toolbar ~linha 733)

- [ ] Adicionar import do DropdownMenu após os imports de Select (já existente no projeto):

```ts
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

- [ ] Substituir o bloco `<Select value={statusFilter} ...>` (~linha 733–743) por:

```tsx
{/* Status filter dropdown */}
{(() => {
  const current = statusFilter === "all"
    ? { label: "Todos os status", Icon: ClipboardCheck }
    : (STATUS_CONFIG[statusFilter] ?? { label: statusFilter, Icon: PersonStanding });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-md border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors">
          <current.Icon size={13} />
          <span>{current.label}</span>
          <ChevronDown size={11} className="ml-0.5 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 bg-zinc-900 border-zinc-700">
        <DropdownMenuLabel className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide py-1.5">
          Status da Negociação
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-zinc-700" />
        {([
          { value: "all",      label: "Todos os status", Icon: ClipboardCheck },
          { value: "aberto",   label: "Em andamento",    Icon: PersonStanding },
          { value: "vendido",  label: "Vendido",         Icon: ThumbsUp       },
          { value: "cancelado",label: "Perdido",         Icon: ThumbsDown     },
          { value: "pausado",  label: "Pausado",         Icon: Pause          },
        ] as const).map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`flex items-center gap-2 text-xs cursor-pointer text-zinc-100 hover:bg-zinc-700 focus:bg-zinc-700 ${statusFilter === value ? "text-primary font-semibold" : ""}`}
          >
            <Icon size={14} className={statusFilter === value ? "text-primary" : "text-zinc-400"} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
})()}
```

- [ ] Commit:

```bash
git add src/pages/CrmPipelinePage.tsx
git commit -m "feat(status): dropdown de filtro com ícones e cabeçalho"
```

---

### Task 5: Tag colorida na capa do card (todos os status)

**Files:**
- Modify: `src/pages/CrmPipelinePage.tsx` (componente `PipelineCard` ~linha 1668)

- [ ] Substituir o trecho que renderiza o chip de status (~linhas 1667–1671) por:

```tsx
{/* Status tag — sempre visível com ícone */}
{(() => {
  const cfg = STATUS_CONFIG[ticket.status] ?? STATUS_FALLBACK;
  const { Icon, label, tagClass } = cfg;
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${tagClass}`}>
      <Icon size={9} />
      {label}
    </span>
  );
})()}
```

Isso substitui o bloco `else` do ternário atual (o terceiro caso após `concluido` e `isDelayed`). Os outros dois casos (`concluido` → "✓ Resolvido" e `isDelayed` → "⚠ Esfriando") são mantidos como estão — a tag de status aparece **adicionalmente** a eles, não em substituição. Mover o novo bloco para fora do ternário, logo após ele:

```tsx
{/* Indicador de stage (concluído / esfriando) — mantido */}
{stageKey === "concluido" ? (
  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-900/60 text-green-300 border border-green-700/50 flex items-center gap-0.5">
    ✓ Resolvido
  </span>
) : isDelayed ? (
  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 border border-amber-700/50 flex items-center gap-0.5">
    ⚠ Esfriando {days}d
  </span>
) : null}

{/* Status da negociação — sempre visível */}
{(() => {
  const { Icon, label, tagClass } = STATUS_CONFIG[ticket.status] ?? STATUS_FALLBACK;
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${tagClass}`}>
      <Icon size={9} />
      {label}
    </span>
  );
})()}
```

- [ ] Commit:

```bash
git add src/pages/CrmPipelinePage.tsx
git commit -m "feat(status): tag colorida com ícone na capa do card"
```

---

### Task 6: Seletor de status no TicketDetailDialog

**Files:**
- Modify: `src/components/tickets/TicketDetailDialog.tsx`

- [ ] Adicionar ícones ao import do lucide (linha 3–9):

```ts
import {
  // ... existentes ...
  ThumbsUp,
  ThumbsDown,
  Pause,
  PersonStanding,
} from "lucide-react";
```

- [ ] Adicionar estado `ticketStatus` após os outros estados (~linha 370):

```ts
const [ticketStatus, setTicketStatus] = useState<string>("");
```

- [ ] No `useEffect` de inicialização (~linha 636), inicializar junto com os outros campos:

```ts
setTicketStatus(ticket.status || "aberto");
```

- [ ] Ampliar o tipo aceito em `updateTicketField` (~linha 783):

```ts
mutationFn: async ({ field, value }: {
  field: "description" | "internal_notes" | "objecao" | "ticket_type" | "origin" | "channel" | "campanha" | "status";
  value: string
}) => {
```

- [ ] Adicionar o `<Select>` de status na seção DADOS DO CARD, **após o campo Campanha** (~linha 1661):

```tsx
{/* Status da negociação */}
<div className="flex items-start gap-2">
  <div className="mt-0.5 text-muted-foreground shrink-0">
    <PersonStanding size={14} />
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-[10px] text-muted-foreground mb-0.5">Status</p>
    <Select
      value={ticketStatus}
      onValueChange={(val) => {
        setTicketStatus(val);
        updateTicketField.mutate({ field: "status", value: val });
      }}
    >
      <SelectTrigger className="h-7 text-xs border-zinc-700 bg-zinc-800 text-zinc-100 w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-zinc-900 border-zinc-700">
        {([
          { value: "aberto",   label: "Em andamento", Icon: PersonStanding },
          { value: "vendido",  label: "Vendido",      Icon: ThumbsUp       },
          { value: "cancelado",label: "Perdido",      Icon: ThumbsDown     },
          { value: "pausado",  label: "Pausado",      Icon: Pause          },
        ] as const).map(({ value, label, Icon }) => (
          <SelectItem key={value} value={value} className="text-xs text-zinc-100 focus:bg-zinc-700">
            <span className="flex items-center gap-1.5">
              <Icon size={12} />
              {label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
</div>
```

- [ ] No `useEffect` de save (~linha 1149), incluir status:

```ts
if (ticketStatus !== (ticket.status || "aberto")) updateTicketField.mutate({ field: "status", value: ticketStatus });
```

- [ ] Commit:

```bash
git add src/components/tickets/TicketDetailDialog.tsx
git commit -m "feat(status): seletor de status na aba Detalhes do card"
```
