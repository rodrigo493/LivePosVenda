# Automação "Criar Cópia do Card" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o `action_type` `create_copy` ao motor de automações CRM — quando ativado numa etapa, cria um ticket idêntico ao original (incluindo comentários) no funil/etapa configurados.

**Architecture:** Extensão pura do sistema existente. Sem novas tabelas. Três arquivos modificados: tipo TypeScript, UI do AutomationRow, handler no execute-automations. O novo case `create_copy` resolve a stage key do `target_stage_id`, carrega o ticket completo + comentários, e insere as cópias sem disparar automações do destino.

**Tech Stack:** TypeScript/React, Supabase Edge Functions (Deno), TanStack Query, Shadcn UI

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/hooks/useStageAutomations.ts` | Modificar linha 4-9 | Adicionar `'create_copy'` ao union type `AutomationActionType` |
| `src/components/crm/AutomationRow.tsx` | Modificar | Novo tipo no ACTION_OPTIONS + seção UI com seletores funil/etapa |
| `supabase/functions/execute-automations/index.ts` | Modificar | Novo case `create_copy` + função `executeCreateCopy` |

---

## Task 1: Adicionar `create_copy` ao tipo TypeScript

**Files:**
- Modify: `src/hooks/useStageAutomations.ts:4-9`

- [ ] **Substituir o bloco `AutomationActionType` (linhas 4-9) pelo novo bloco:**

```typescript
export type AutomationActionType =
  | "whatsapp_message"
  | "create_task"
  | "notify_user"
  | "move_stage"
  | "send_email"
  | "create_copy";
```

- [ ] **Verificar que o build passa sem erros de tipo:**

```bash
npm run build 2>&1 | tail -5
```

Saída esperada: `✓ built in X.Xs`

- [ ] **Commit:**

```bash
git add src/hooks/useStageAutomations.ts
git commit -m "feat(automations): adiciona create_copy ao AutomationActionType"
```

---

## Task 2: Atualizar UI do AutomationRow

**Files:**
- Modify: `src/components/crm/AutomationRow.tsx`

O componente atual não importa `react` nem `supabase` — precisamos adicionar ambos. A seção `create_copy` carrega pipelines e etapas diretamente via queries inline num sub-componente.

- [ ] **Adicionar imports no topo do arquivo (após a linha 1):**

Substituir as linhas 1-5 atuais:

```tsx
// src/components/crm/AutomationRow.tsx
import { Zap, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AutomationActionType } from "@/hooks/useStageAutomations";
```

Por:

```tsx
// src/components/crm/AutomationRow.tsx
import { useEffect, useState } from "react";
import { Zap, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { AutomationActionType } from "@/hooks/useStageAutomations";
```

- [ ] **Adicionar `'📋 Criar Cópia do Card'` ao `ACTION_OPTIONS` (linha 22-28):**

Substituir o array `ACTION_OPTIONS`:

```tsx
const ACTION_OPTIONS: { value: AutomationActionType; label: string }[] = [
  { value: "whatsapp_message", label: "📱 Enviar WhatsApp" },
  { value: "create_task", label: "✅ Criar tarefa" },
  { value: "notify_user", label: "🔔 Notificar usuário" },
  { value: "move_stage", label: "➡️ Mover para etapa" },
  { value: "send_email", label: "📧 Enviar e-mail" },
  { value: "create_copy", label: "📋 Criar Cópia do Card" },
];
```

- [ ] **Adicionar o sub-componente `CopyConfigSection` antes de `export function AutomationRow`:**

Inserir após a função `VariableChips` (após a linha 57, antes da linha 59):

```tsx
function CopyConfigSection({
  cfg,
  onCfgChange,
}: {
  cfg: Record<string, unknown>;
  onCfgChange: (key: string, value: unknown) => void;
}) {
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [stages, setStages] = useState<{ id: string; label: string }[]>([]);
  const selectedPipelineId = (cfg.target_pipeline_id as string) ?? "";
  const selectedStageId = (cfg.target_stage_id as string) ?? "";

  useEffect(() => {
    (supabase as any)
      .from("pipelines")
      .select("id, name")
      .order("name")
      .then(({ data }: { data: { id: string; name: string }[] | null }) => {
        setPipelines(data ?? []);
      });
  }, []);

  useEffect(() => {
    if (!selectedPipelineId) {
      setStages([]);
      return;
    }
    (supabase as any)
      .from("pipeline_stages")
      .select("id, label")
      .eq("pipeline_id", selectedPipelineId)
      .order("position", { ascending: true })
      .then(({ data }: { data: { id: string; label: string }[] | null }) => {
        setStages(data ?? []);
      });
  }, [selectedPipelineId]);

  return (
    <div className="space-y-1.5">
      <select
        value={selectedPipelineId}
        onChange={(e) => {
          onCfgChange("target_pipeline_id", e.target.value);
          onCfgChange("target_stage_id", "");
        }}
        className="w-full h-7 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="" className="bg-zinc-800">Selecionar funil destino</option>
        {pipelines.map((p) => (
          <option key={p.id} value={p.id} className="bg-zinc-800">
            {p.name}
          </option>
        ))}
      </select>
      <select
        value={selectedStageId}
        onChange={(e) => onCfgChange("target_stage_id", e.target.value)}
        disabled={!selectedPipelineId}
        className="w-full h-7 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value="" className="bg-zinc-800">Selecionar etapa destino</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id} className="bg-zinc-800">
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Adicionar o bloco `create_copy` na seção de config (após o bloco `send_email`, antes do `</div>` de fechamento do return):**

Inserir após a linha 233 (`}`), antes do fechamento `</div>` e `);`:

```tsx
      {automation.action_type === "create_copy" && (
        <CopyConfigSection
          cfg={cfg}
          onCfgChange={handleConfigChange}
        />
      )}
```

- [ ] **Verificar que o build passa sem erros de tipo:**

```bash
npm run build 2>&1 | tail -5
```

Saída esperada: `✓ built in X.Xs`

- [ ] **Verificar no browser (dev server):**

```bash
npm run dev
```

1. Navegar para um funil no CRM → entrar no modo edição de uma etapa
2. Clicar em "+ Adicionar automação"
3. No select de tipo, verificar que "📋 Criar Cópia do Card" aparece na lista
4. Selecionar "📋 Criar Cópia do Card"
5. Verificar que dois dropdowns aparecem: "Selecionar funil destino" e "Selecionar etapa destino"
6. Selecionar um funil → verificar que as etapas do funil carregam no segundo dropdown
7. Selecionar uma etapa → salvar o funil

- [ ] **Commit:**

```bash
git add src/components/crm/AutomationRow.tsx
git commit -m "feat(automations): UI create_copy com seletores de funil e etapa"
```

---

## Task 3: Handler `create_copy` no execute-automations

**Files:**
- Modify: `supabase/functions/execute-automations/index.ts`

- [ ] **Adicionar o novo case no `switch` (após o case `notify_user`, linha ~98):**

Localizar o bloco:
```typescript
        case "notify_user":
          await executeSquadFallback(SQUAD_TOKEN, ticket, cfg, "Notificação");
          break;
        default:
```

Substituir por:
```typescript
        case "notify_user":
          await executeSquadFallback(SQUAD_TOKEN, ticket, cfg, "Notificação");
          break;
        case "create_copy":
          await executeCreateCopy(supabase, ticket.id, cfg);
          break;
        default:
```

- [ ] **Adicionar a função `executeCreateCopy` ao final do arquivo (antes do último `}`ou após `markFailed`):**

Adicionar após a função `markFailed` (após a linha 229):

```typescript
async function executeCreateCopy(
  supabase: any,
  ticketId: string,
  cfg: Record<string, unknown>
) {
  const targetPipelineId = (cfg.target_pipeline_id as string) ?? "";
  const targetStageId = (cfg.target_stage_id as string) ?? "";

  if (!targetPipelineId || !targetStageId) {
    throw new Error("create_copy: target_pipeline_id e target_stage_id são obrigatórios na action_config");
  }

  // Resolve a key da etapa destino a partir do ID
  const { data: stageData, error: stageErr } = await supabase
    .from("pipeline_stages")
    .select("key")
    .eq("id", targetStageId)
    .eq("pipeline_id", targetPipelineId)
    .single();

  if (stageErr || !stageData) {
    throw new Error(
      `create_copy: etapa destino não encontrada (stage_id=${targetStageId}, pipeline_id=${targetPipelineId}): ${stageErr?.message ?? "null"}`
    );
  }

  // Carrega todos os campos do ticket original
  const { data: original, error: origErr } = await supabase
    .from("tickets")
    .select(
      "title, client_id, assigned_to, description, internal_notes, channel, priority, problem_category, ticket_type, equipment_id, estimated_value"
    )
    .eq("id", ticketId)
    .single();

  if (origErr || !original) {
    throw new Error(`create_copy: ticket original não encontrado: ${origErr?.message ?? "null"}`);
  }

  // Carrega os comentários do ticket original
  const { data: comments } = await supabase
    .from("ticket_comments")
    .select("content, author_id, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  // Cria o ticket cópia
  const { data: newTicket, error: insertErr } = await supabase
    .from("tickets")
    .insert({
      title: original.title,
      client_id: original.client_id,
      assigned_to: original.assigned_to,
      description: original.description,
      internal_notes: original.internal_notes,
      channel: original.channel,
      priority: original.priority,
      problem_category: original.problem_category,
      ticket_type: original.ticket_type,
      equipment_id: original.equipment_id,
      estimated_value: original.estimated_value,
      pipeline_id: targetPipelineId,
      pipeline_stage: stageData.key,
      status: "aberto",
      origin: "copy",
      ticket_number: "",
    })
    .select("id")
    .single();

  if (insertErr || !newTicket) {
    throw new Error(`create_copy: falha ao criar ticket cópia: ${insertErr?.message ?? "null"}`);
  }

  // Copia os comentários para o novo ticket
  if (comments && comments.length > 0) {
    const copies = (comments as { content: string; author_id: string | null; created_at: string }[]).map((c) => ({
      ticket_id: newTicket.id,
      content: c.content,
      author_id: c.author_id,
      created_at: c.created_at,
    }));
    const { error: commentsErr } = await supabase.from("ticket_comments").insert(copies);
    if (commentsErr) {
      // Log mas não falha — o ticket foi criado com sucesso
      console.warn(`[create_copy] falha ao copiar comentários para ${newTicket.id}: ${commentsErr.message}`);
    }
  }

  console.log(`[create_copy] ticket ${ticketId} copiado → novo id: ${newTicket.id} (pipeline=${targetPipelineId}, stage=${stageData.key})`);
}
```

- [ ] **Deploy da função:**

```bash
npx supabase functions deploy execute-automations
```

Saída esperada: `Deployed Functions execute-automations`

- [ ] **Commit:**

```bash
git add supabase/functions/execute-automations/index.ts
git commit -m "feat(automations): handler create_copy — clona ticket + comentários para funil/etapa destino"
```

---

## Task 4: Teste end-to-end

- [ ] **Configurar a automação no CRM:**

1. Abrir o CRM → entrar no modo edição de um funil de teste
2. Numa etapa qualquer, adicionar automação "📋 Criar Cópia do Card"
3. Selecionar funil e etapa destino (pode ser o mesmo funil, etapa diferente)
4. Delay: `0` minutos
5. Salvar

- [ ] **Criar um ticket de teste com comentários:**

No banco (SQL Editor do Supabase):

```sql
-- Verificar se o ticket de teste tem comentários
SELECT t.id, t.title, COUNT(tc.id) as n_comments
FROM tickets t
LEFT JOIN ticket_comments tc ON tc.ticket_id = t.id
WHERE t.pipeline_stage = '<key-da-etapa-com-automacao>'
GROUP BY t.id, t.title
LIMIT 5;
```

- [ ] **Mover o card para a etapa com a automação ativa e verificar a fila:**

```sql
-- Verificar que a entrada foi inserida na fila
SELECT * FROM pipeline_automation_queue
ORDER BY created_at DESC LIMIT 3;
```

Esperado: linha com `status = 'pending'` e `automation_id` apontando para a automação `create_copy`.

- [ ] **Aguardar até 1 minuto e verificar execução:**

```sql
-- Verificar resultado
SELECT id, status, error, executed_at
FROM pipeline_automation_queue
ORDER BY created_at DESC LIMIT 3;
```

Esperado: `status = 'done'`, `executed_at` preenchido.

- [ ] **Verificar o ticket copiado no banco:**

```sql
-- Confirmar que o ticket cópia foi criado
SELECT id, title, pipeline_id, pipeline_stage, status, origin, created_at
FROM tickets
WHERE origin = 'copy'
ORDER BY created_at DESC LIMIT 3;
```

Esperado: novo ticket com `origin = 'copy'`, `pipeline_stage` correto, `status = 'aberto'`.

- [ ] **Verificar comentários copiados:**

```sql
-- Confirmar cópia dos comentários
SELECT tc.id, tc.content, tc.ticket_id
FROM ticket_comments tc
INNER JOIN tickets t ON t.id = tc.ticket_id
WHERE t.origin = 'copy'
ORDER BY tc.created_at ASC;
```

Esperado: mesmos comentários do ticket original com novo `ticket_id`.

- [ ] **Deploy na VPS e commit final:**

```bash
git push origin main
ssh root@squad.liveuni.com.br "cd /opt/posvenda && bash deploy.sh"
```

---

## Self-Review — Cobertura da Spec

| Requisito Spec | Task | Status |
|---|---|---|
| `create_copy` adicionado ao `AutomationActionType` | Task 1 | ✅ |
| `'📋 Criar Cópia do Card'` no `ACTION_OPTIONS` | Task 2 | ✅ |
| UI com seletor de funil e etapa filtrada | Task 2 | ✅ |
| Seletor de etapa desabilitado até funil selecionado | Task 2 | ✅ |
| `action_config` salvo com `target_pipeline_id` e `target_stage_id` | Task 2 | ✅ |
| Resolver `key` da etapa via `target_stage_id` | Task 3 | ✅ |
| Copiar: title, client_id, assigned_to, description, internal_notes | Task 3 | ✅ |
| Copiar: channel, priority, problem_category, ticket_type | Task 3 | ✅ |
| Copiar: equipment_id, estimated_value | Task 3 | ✅ |
| ticket_comments copiados (sem rd_activity_id) | Task 3 | ✅ |
| `status = 'aberto'` no novo ticket | Task 3 | ✅ |
| `origin = 'copy'` no novo ticket | Task 3 | ✅ |
| Falha nos comments não derruba o ticket (warn, não throw) | Task 3 | ✅ |
| Etapa inválida → `failed` com mensagem descritiva | Task 3 | ✅ |
| Não dispara automações do destino (sem chamada trigger-automations) | Task 3 | ✅ |
| Teste end-to-end verificando ticket + comments + fila | Task 4 | ✅ |
