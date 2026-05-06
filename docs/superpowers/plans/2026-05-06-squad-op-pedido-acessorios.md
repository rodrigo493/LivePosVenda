# Squad OP / Pedido Acessórios Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirecionar o botão OP (itens do pedido) para o workflow "Gerar OP/Compra" e o submit do Nomus para o workflow "Fluxo Pedido Acessórios" no SquadOS, nas páginas PA, PD e PG.

**Architecture:** A Edge Function `squad-notify` recebe um novo parâmetro `target` que determina para qual endpoint do SquadOS rotear. Dois novos endpoints são criados no SquadOS (`/api/gerar-op` e `/api/pedido-acessorios`), modelados sobre o `/api/pos-venda` existente. No frontend, apenas dois tipos de chamadas `notifySquad` mudam: o botão OP e o submit do Nomus.

**Tech Stack:** TypeScript, Next.js (SquadOS), Deno/Supabase Edge Functions, React (LivePosVenda)

**Repos:**
- LivePosVenda: `C:\VS_CODE\LivePosVenda`
- SquadOS: `C:\VS_CODE\Agentes_live\squados`

---

## Mapa de arquivos

| Arquivo | Ação |
|---------|------|
| `squados/src/app/api/gerar-op/route.ts` | Criar |
| `squados/src/app/api/pedido-acessorios/route.ts` | Criar |
| `LivePosVenda/supabase/functions/squad-notify/index.ts` | Modificar |
| `LivePosVenda/src/lib/squadNotify.ts` | Modificar |
| `LivePosVenda/src/pages/PADetailPage.tsx` | Modificar (2 chamadas) |
| `LivePosVenda/src/pages/PDDetailPage.tsx` | Modificar (2 chamadas) |
| `LivePosVenda/src/pages/PGDetailPage.tsx` | Modificar (2 chamadas) |

---

## Task 1: SquadOS — endpoint `/api/gerar-op`

**Files:**
- Create: `C:/VS_CODE/Agentes_live/squados/src/app/api/gerar-op/route.ts`

Modelado sobre `/api/pos-venda/route.ts`. Diferença principal: quando já existe instância ativa (`running`) para a referência, **não retorna 409** — faz append nas notes e retorna 200 `{ merged: true }`.

- [ ] **Criar o arquivo**

```typescript
// C:/VS_CODE/Agentes_live/squados/src/app/api/gerar-op/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createWorkflowInstance } from '@/features/workflows/lib/create-workflow-instance';

const SECRET = process.env.POS_VENDA_WEBHOOK_SECRET;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const apiKey = req.headers.get('x-api-key') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : apiKey;

  if (!SECRET || token !== SECRET) return json({ error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { reference, url, notes } = body as {
    reference?: string;
    url?: string;
    notes?: string;
  };

  if (!reference?.trim()) return json({ error: 'reference é obrigatório' }, 400);

  const ref = reference.trim();
  const title = url ? `${ref} — ${url.trim()}` : ref;

  const admin = createAdminClient();

  // Busca template "Gerar OP"
  const { data: templates, error: tplErr } = await admin
    .from('workflow_templates')
    .select('id, name')
    .ilike('name', '%Gerar OP%')
    .eq('is_active', true)
    .limit(1);

  if (tplErr) return json({ error: 'Erro interno ao buscar template' }, 500);

  if (!templates || templates.length === 0) {
    console.warn('[gerar-op] nenhum template "Gerar OP" ativo — ignorando', { ref });
    return json({ ignored: true, reason: 'no_template' });
  }

  const templateId = templates[0].id;

  // Verifica se já existe instância running para esta referência
  const { data: existing } = await admin
    .from('workflow_instances')
    .select('id, metadata')
    .eq('template_id', templateId)
    .eq('reference', ref)
    .eq('status', 'running')
    .limit(1);

  if (existing && existing.length > 0) {
    // Append nas notes da instância existente
    const currentMeta = (existing[0].metadata as Record<string, unknown>) ?? {};
    const currentNotes = typeof currentMeta.notes === 'string' ? currentMeta.notes : '';
    const newNotes = notes?.trim()
      ? (currentNotes ? `${currentNotes}\n${notes.trim()}` : notes.trim())
      : currentNotes;

    await admin
      .from('workflow_instances')
      .update({ metadata: { ...currentMeta, notes: newNotes, ...(url ? { url } : {}) } })
      .eq('id', existing[0].id);

    return json({ merged: true, instance_id: existing[0].id, reference: ref });
  }

  // Cria nova instância
  const { data: created, error: createErr } = await createWorkflowInstance(admin, {
    templateId,
    reference: ref,
    title,
    startedBy: null,
  });

  if (createErr || !created) {
    console.error('[gerar-op] create instance error:', createErr);
    return json({ error: createErr ?? 'Falha ao criar instância' }, 500);
  }

  if (notes?.trim() || url) {
    await admin
      .from('workflow_instances')
      .update({ metadata: { ...(url ? { url } : {}), ...(notes?.trim() ? { notes: notes.trim() } : {}) } })
      .eq('id', created.instance_id);
  }

  return json({
    success: true,
    instance_id: created.instance_id,
    reference: ref,
    template_name: templates[0].name,
  });
}
```

- [ ] **Commit no SquadOS**

```bash
cd "C:/VS_CODE/Agentes_live/squados"
git add src/app/api/gerar-op/route.ts
git commit -m "feat(api): endpoint /api/gerar-op para workflow Gerar OP/Compra"
```

---

## Task 2: SquadOS — endpoint `/api/pedido-acessorios`

**Files:**
- Create: `C:/VS_CODE/Agentes_live/squados/src/app/api/pedido-acessorios/route.ts`

Mesmo padrão do `/api/pos-venda`. Busca template `ILIKE '%Pedido Acess%'`. Duplicata → merge nas notes (sem 409).

- [ ] **Criar o arquivo**

```typescript
// C:/VS_CODE/Agentes_live/squados/src/app/api/pedido-acessorios/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';
import { createWorkflowInstance } from '@/features/workflows/lib/create-workflow-instance';
import { extractPosVendaFromUrl } from '@/features/workflows/lib/posvenda-client';

const SECRET = process.env.POS_VENDA_WEBHOOK_SECRET;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const apiKey = req.headers.get('x-api-key') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : apiKey;

  if (!SECRET || token !== SECRET) return json({ error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { reference, url, notes } = body as {
    reference?: string;
    url?: string;
    notes?: string;
  };

  if (!reference?.trim()) return json({ error: 'reference é obrigatório' }, 400);

  const ref = reference.trim();
  const title = url ? `${ref} — ${url.trim()}` : ref;

  const admin = createAdminClient();

  const { data: templates, error: tplErr } = await admin
    .from('workflow_templates')
    .select('id, name')
    .ilike('name', '%Pedido Acess%')
    .eq('is_active', true)
    .limit(1);

  if (tplErr) return json({ error: 'Erro interno ao buscar template' }, 500);

  if (!templates || templates.length === 0) {
    console.warn('[pedido-acessorios] nenhum template "Pedido Acess" ativo — ignorando', { ref });
    return json({ ignored: true, reason: 'no_template' });
  }

  const templateId = templates[0].id;

  const { data: existing } = await admin
    .from('workflow_instances')
    .select('id, metadata')
    .eq('template_id', templateId)
    .eq('reference', ref)
    .eq('status', 'running')
    .limit(1);

  if (existing && existing.length > 0) {
    const currentMeta = (existing[0].metadata as Record<string, unknown>) ?? {};
    const posvenda = url ? extractPosVendaFromUrl(url) : null;
    const currentNotes = typeof currentMeta.notes === 'string' ? currentMeta.notes : '';
    const newNotes = notes?.trim()
      ? (currentNotes ? `${currentNotes}\n${notes.trim()}` : notes.trim())
      : currentNotes;

    await admin
      .from('workflow_instances')
      .update({
        metadata: {
          ...currentMeta,
          notes: newNotes,
          ...(posvenda ? { posvenda: { type: posvenda.type, uuid: posvenda.uuid, url } } : {}),
        },
      })
      .eq('id', existing[0].id);

    return json({ merged: true, instance_id: existing[0].id, reference: ref });
  }

  const { data: created, error: createErr } = await createWorkflowInstance(admin, {
    templateId,
    reference: ref,
    title,
    startedBy: null,
  });

  if (createErr || !created) {
    console.error('[pedido-acessorios] create instance error:', createErr);
    return json({ error: createErr ?? 'Falha ao criar instância' }, 500);
  }

  const posvenda = url ? extractPosVendaFromUrl(url) : null;
  const metadataToSave = {
    ...(posvenda ? { posvenda: { type: posvenda.type, uuid: posvenda.uuid, url } } : {}),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  };
  if (Object.keys(metadataToSave).length > 0) {
    await admin
      .from('workflow_instances')
      .update({ metadata: metadataToSave })
      .eq('id', created.instance_id);
  }

  return json({
    success: true,
    instance_id: created.instance_id,
    reference: ref,
    template_name: templates[0].name,
  });
}
```

- [ ] **Commit no SquadOS**

```bash
cd "C:/VS_CODE/Agentes_live/squados"
git add src/app/api/pedido-acessorios/route.ts
git commit -m "feat(api): endpoint /api/pedido-acessorios para workflow Fluxo Pedido Acessórios"
```

---

## Task 3: Edge Function `squad-notify` — roteamento por `target`

**Files:**
- Modify: `C:/VS_CODE/LivePosVenda/supabase/functions/squad-notify/index.ts`

Adiciona `target` ao body. Roteia para a URL correta no SquadOS.

- [ ] **Substituir o arquivo completo**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://posvenda.liveuni.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-supabase-client-runtime-version',
};

const SQUAD_BASE = 'https://squad.liveuni.com.br';
const POSVENDA_BASE = 'https://posvenda.liveuni.com.br';

type RecordType = 'pa' | 'pd' | 'pg';
type Target = 'pos-venda' | 'gerar-op' | 'pedido-acessorios';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function squadUrlFor(target: Target): string {
  const endpoints: Record<Target, string> = {
    'pos-venda': `${SQUAD_BASE}/api/pos-venda`,
    'gerar-op': `${SQUAD_BASE}/api/gerar-op`,
    'pedido-acessorios': `${SQUAD_BASE}/api/pedido-acessorios`,
  };
  return endpoints[target] ?? endpoints['pos-venda'];
}

function pathFor(recordType: RecordType, recordId: string): string {
  const segments: Record<RecordType, string> = {
    pa: 'pedidos-acessorios',
    pd: 'pedidos-direto',
    pg: 'pedidos-garantia',
  };
  const segment = segments[recordType] ?? 'pedidos-acessorios';
  return `${POSVENDA_BASE}/${segment}/${recordId}`;
}

function tableFor(recordType: RecordType): string {
  const tables: Record<RecordType, string> = {
    pa: 'service_requests',
    pd: 'service_requests',
    pg: 'warranty_claims',
  };
  return tables[recordType] ?? 'service_requests';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SQUAD_TOKEN = Deno.env.get('SQUAD_TOKEN');
    if (!SQUAD_TOKEN) return jsonResponse({ error: 'SQUAD_TOKEN not configured' }, 500);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { record_type, record_id, reference, message, target } = body as {
      record_type?: RecordType;
      record_id?: string;
      reference?: string;
      message?: string;
      target?: Target;
    };

    if (record_type !== 'pa' && record_type !== 'pd' && record_type !== 'pg') {
      return jsonResponse({ error: 'record_type must be "pa", "pd" or "pg"' }, 400);
    }
    if (!record_id || !reference) {
      return jsonResponse({ error: 'record_id and reference are required' }, 400);
    }

    const resolvedTarget: Target = target ?? 'pos-venda';
    const squadUrl = squadUrlFor(resolvedTarget);
    const url = pathFor(record_type, record_id);
    const table = tableFor(record_type);

    // Usa message passado ou busca squad_notes no banco (apenas para pos-venda)
    let notes: string | null = message ?? null;
    if (!notes && resolvedTarget === 'pos-venda') {
      const { data: record } = await supabase
        .from(table)
        .select('squad_notes')
        .eq('id', record_id)
        .maybeSingle();
      notes = (record as any)?.squad_notes ?? null;
    }

    let status: number | null = null;
    let errorText: string | null = null;

    try {
      const res = await fetch(squadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SQUAD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference, url, ...(notes ? { notes } : {}) }),
      });
      status = res.status;
      if (!res.ok) {
        if (res.status === 409) {
          status = 409;
        } else {
          const text = await res.text().catch(() => '');
          errorText = `Squad [${res.status}]: ${text.slice(0, 500)}`;
        }
      }
    } catch (e) {
      errorText = e instanceof Error ? e.message : 'Falha de rede ao chamar Squad';
    }

    // Persiste resultado apenas para pos-venda (tem colunas squad_sent_at no banco)
    if (resolvedTarget === 'pos-venda') {
      await supabase
        .from(table)
        .update({
          squad_sent_at: new Date().toISOString(),
          squad_response_status: status,
          squad_error: errorText,
        })
        .eq('id', record_id);
    }

    if (errorText) return jsonResponse({ success: false, status, error: errorText });
    return jsonResponse({ success: true, status });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: msg }, 500);
  }
});
```

- [ ] **Commit**

```bash
cd "C:\VS_CODE\LivePosVenda"
git add supabase/functions/squad-notify/index.ts
git commit -m "feat(edge): squad-notify aceita target para roteamento de workflow"
```

---

## Task 4: `squadNotify.ts` — adicionar parâmetro `target`

**Files:**
- Modify: `C:/VS_CODE/LivePosVenda/src/lib/squadNotify.ts`

- [ ] **Substituir o arquivo completo**

```typescript
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type NotifySquadParams = {
  recordType: "pa" | "pd" | "pg";
  recordId: string;
  reference: string;
  message?: string;
  target?: "pos-venda" | "gerar-op" | "pedido-acessorios";
};

export async function notifySquad({ recordType, recordId, reference, message, target }: NotifySquadParams): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("squad-notify", {
      body: {
        record_type: recordType,
        record_id: recordId,
        reference,
        ...(message ? { message } : {}),
        ...(target ? { target } : {}),
      },
    });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || "Squad recusou a requisição");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha ao notificar Squad";
    if (import.meta.env.DEV) console.error("[squad-notify]", err);
    toast.warning(`Squad não foi notificado: ${msg}`);
    return false;
  }
}
```

- [ ] **Verificar TypeScript**

```bash
cd "C:\VS_CODE\LivePosVenda"
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/lib/squadNotify.ts
git commit -m "feat(lib): squadNotify aceita target para roteamento de workflow"
```

---

## Task 5: PADetailPage — atualizar chamadas

**Files:**
- Modify: `C:/VS_CODE/LivePosVenda/src/pages/PADetailPage.tsx`

Duas mudanças:
1. **Botão OP** (linha com `message: \`Produzir/Comprar: ${name}\``) → adicionar `target: "gerar-op"`
2. **Submit Nomus** (linha `void notifySquad({ recordType: "pa"...` dentro da função de aprovação, sem `message`) → adicionar `target: "pedido-acessorios"`

- [ ] **Atualizar botão OP**

Localizar:
```typescript
const ok = await notifySquad({ recordType: "pa", recordId: id!, reference: requestNumber, message: `Produzir/Comprar: ${name}` });
```

Substituir por:
```typescript
const ok = await notifySquad({ recordType: "pa", recordId: id!, reference: requestNumber, message: `Produzir/Comprar: ${name}`, target: "gerar-op" });
```

- [ ] **Atualizar submit Nomus**

Localizar (dentro da função `handleApprove` / aprova e envia ao Nomus, chamada sem `message`):
```typescript
void notifySquad({ recordType: "pa", recordId: id!, reference: requestNumber });
```

Substituir por:
```typescript
void notifySquad({ recordType: "pa", recordId: id!, reference: requestNumber, target: "pedido-acessorios" });
```

> Atenção: há 3 chamadas `notifySquad` em PADetailPage. As duas que NÃO devem ser alteradas são as do `handleSaveSquadNotes` (linha ~544) e do `handleSaveItems` (linha ~632) — ambas sem `message` e dentro de funções diferentes da de aprovação. Apenas a chamada dentro da função que cria/atualiza o pedido Nomus deve receber `target: "pedido-acessorios"`.

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

Expected: sem erros.

- [ ] **Commit**

```bash
git add src/pages/PADetailPage.tsx
git commit -m "feat(pa): botão OP → gerar-op; submit Nomus → pedido-acessorios"
```

---

## Task 6: PDDetailPage — atualizar chamadas

**Files:**
- Modify: `C:/VS_CODE/LivePosVenda/src/pages/PDDetailPage.tsx`

Mesmo padrão da Task 5. As 4 chamadas `notifySquad` ficam:
- Linha ~535 (squad notes): sem alteração
- Linha ~618 (salvar itens): sem alteração
- Linha ~679 (submit Nomus): adicionar `target: "pedido-acessorios"`
- Linha ~1230 (botão OP): adicionar `target: "gerar-op"`

- [ ] **Atualizar botão OP**

Localizar:
```typescript
const ok = await notifySquad({ recordType: "pd", recordId: id!, reference: requestNumber, message: `Produzir/Comprar: ${name}` });
```

Substituir por:
```typescript
const ok = await notifySquad({ recordType: "pd", recordId: id!, reference: requestNumber, message: `Produzir/Comprar: ${name}`, target: "gerar-op" });
```

- [ ] **Atualizar submit Nomus**

Localizar (função de aprovação/submit Nomus, chamada sem `message`):
```typescript
void notifySquad({ recordType: "pd", recordId: id!, reference: requestNumber });
```

Substituir por:
```typescript
void notifySquad({ recordType: "pd", recordId: id!, reference: requestNumber, target: "pedido-acessorios" });
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/pages/PDDetailPage.tsx
git commit -m "feat(pd): botão OP → gerar-op; submit Nomus → pedido-acessorios"
```

---

## Task 7: PGDetailPage — atualizar chamadas

**Files:**
- Modify: `C:/VS_CODE/LivePosVenda/src/pages/PGDetailPage.tsx`

Mesmo padrão. As 4 chamadas `notifySquad` ficam:
- Linha ~578 (squad notes): sem alteração
- Linha ~621 (outro evento): sem alteração
- Linha ~653 (submit Nomus): adicionar `target: "pedido-acessorios"`
- Linha ~1186 (botão OP): adicionar `target: "gerar-op"`

- [ ] **Atualizar botão OP**

Localizar:
```typescript
const ok = await notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber, message: `Produzir/Comprar: ${name}` });
```

Substituir por:
```typescript
const ok = await notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber, message: `Produzir/Comprar: ${name}`, target: "gerar-op" });
```

- [ ] **Atualizar submit Nomus**

Localizar (função de aprovação/submit Nomus, chamada sem `message`):
```typescript
void notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber });
```

Substituir por:
```typescript
void notifySquad({ recordType: "pg", recordId: id!, reference: claimNumber, target: "pedido-acessorios" });
```

- [ ] **Verificar TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/pages/PGDetailPage.tsx
git commit -m "feat(pg): botão OP → gerar-op; submit Nomus → pedido-acessorios"
```

---

## Task 8: Deploy

- [ ] **Deploy Edge Function**

```bash
cd "C:\VS_CODE\LivePosVenda"
npx supabase functions deploy squad-notify
```

Expected: `Deployed squad-notify`

- [ ] **Deploy SquadOS na VPS**

```bash
cd "C:/VS_CODE/Agentes_live/squados"
git push origin main
```

Depois acionar o deploy na VPS (bind mount em `/opt/squad`, conforme processo habitual):

```bash
ssh usuario@squad.liveuni.com.br "cd /opt/squad && git pull && npm run build && pm2 restart squados"
```

- [ ] **Smoke test — botão OP**

1. Abrir um PA/PD/PG com itens
2. Clicar em "OP" num item
3. Verificar toast `"Ordem enviada ao Squad!"`
4. Abrir SquadOS → Workflows → deve aparecer instância em "Gerar OP/Compra"

- [ ] **Smoke test — submit Nomus**

1. Abrir um PA/PD/PG e enviar ao Nomus
2. Verificar toast de sucesso do Nomus
3. Abrir SquadOS → Workflows → deve aparecer instância em "Fluxo Pedido Acessórios"

- [ ] **Smoke test — segundo item no mesmo pedido (append)**

1. Clicar em "OP" num segundo item do mesmo PA/PD/PG
2. Abrir SquadOS → verificar que a instância existente foi atualizada (notes com dois itens), não criada duplicata
