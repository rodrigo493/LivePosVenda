# WA AI Feedback & Sugestões de Resposta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sistema de feedback IA em conversas WhatsApp (Feature 1) + sugestões de resposta em tempo real no sidebar da extensão Chrome (Feature 2), usando o agente `agente-feedback-wa` no OpenClaw da VPS via webhooks assíncronos.

**Architecture:** OpenClaw async hook → Supabase Edge Function webhook → banco. Feature 1 dispara por botão manual/pg_cron, armazena scores estruturados em `wa_feedbacks` e notifica via `notifications`. Feature 2 dispara a cada mensagem inbound na extensão, background.js faz polling do resultado e empurra para o sidebar via `chrome.tabs.sendMessage`.

**Tech Stack:** Deno + Supabase Edge Functions, PostgreSQL RLS, Chrome Extension MV3 (background service worker + content script), React + TanStack Query, Recharts (gráfico de evolução), Tailwind/shadcn.

**Env vars necessárias no Supabase:** `OPENCLAW_URL` = `https://openclaw.liveuni.com.br`, `OPENCLAW_HOOKS_TOKEN` = token do campo `hooks.token` do `openclaw.json`, `OPENCLAW_WEBHOOK_SECRET` = string aleatória usada para validar callbacks.

---

## Mapa de arquivos

| Ação | Arquivo |
|---|---|
| Criar | `supabase/migrations/20260509000030_wa_feedbacks.sql` |
| Criar | `supabase/migrations/20260509000031_wa_analysis_settings.sql` |
| Criar | `supabase/migrations/20260509000032_notifications.sql` |
| Criar | `supabase/migrations/20260509000033_wa_suggestions.sql` |
| Criar | `supabase/functions/analyze-wa-conversation/index.ts` |
| Criar | `supabase/functions/wa-feedback-webhook/index.ts` |
| Criar | `supabase/functions/suggest-wa-response/index.ts` |
| Criar | `supabase/functions/wa-suggestion-webhook/index.ts` |
| Criar | `src/hooks/useNotifications.ts` |
| Criar | `src/components/wa/WaFeedbackPanel.tsx` |
| Criar | `src/pages/MeuDesempenhoWAPage.tsx` |
| Criar | `src/pages/AdminDesempenhoWAPage.tsx` |
| Modificar | `src/pages/MinhasConversasWAPage.tsx` |
| Modificar | `src/pages/AdminConversasPage.tsx` |
| Modificar | `src/pages/SettingsPage.tsx` |
| Modificar | `src/components/layout/AppLayout.tsx` |
| Modificar | `src/components/layout/AppSidebar.tsx` |
| Modificar | `src/lib/crmModules.ts` |
| Modificar | `src/App.tsx` |
| Modificar | `livecrm-extension/background.js` |
| Modificar | `livecrm-extension/content_script.js` |

---

## Task 1: Migrations — 4 tabelas novas

**Files:**
- Criar: `supabase/migrations/20260509000030_wa_feedbacks.sql`
- Criar: `supabase/migrations/20260509000031_wa_analysis_settings.sql`
- Criar: `supabase/migrations/20260509000032_notifications.sql`
- Criar: `supabase/migrations/20260509000033_wa_suggestions.sql`

- [ ] **Step 1: Criar migration wa_feedbacks**

```sql
-- supabase/migrations/20260509000030_wa_feedbacks.sql
create table if not exists wa_feedbacks (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references clients(id) on delete cascade,
  user_id             uuid references auth.users(id),
  instance_id         uuid references pipeline_whatsapp_instances(id),
  score_overall       numeric(4,2),
  score_response_time numeric(4,2),
  score_tone          numeric(4,2),
  score_commercial    numeric(4,2),
  summary             text,
  recommendations     jsonb default '[]'::jsonb,
  alert_level         text check (alert_level in ('ok','warning','critical')),
  status              text default 'pending' check (status in ('pending','done','error')),
  run_id              text,
  raw_response        text,
  created_at          timestamptz default now()
);

alter table wa_feedbacks enable row level security;

create policy "wa_feedbacks_user_own" on wa_feedbacks
  for select using (user_id = auth.uid());

create policy "wa_feedbacks_admin_all" on wa_feedbacks
  for select using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid() and role in ('admin','master_admin')
    )
  );
```

- [ ] **Step 2: Criar migration wa_analysis_settings**

```sql
-- supabase/migrations/20260509000031_wa_analysis_settings.sql
create table if not exists wa_analysis_settings (
  id               uuid primary key default gen_random_uuid(),
  trigger_type     text default 'manual' check (trigger_type in ('manual','scheduled')),
  schedule_cron    text default '0 22 * * *',
  alert_threshold  numeric(4,2) default 5.0,
  agent_id         text default 'agente-feedback-wa',
  updated_at       timestamptz default now()
);

insert into wa_analysis_settings (id)
  values ('00000000-0000-0000-0000-000000000001')
  on conflict (id) do nothing;
```

- [ ] **Step 3: Criar migration notifications**

```sql
-- supabase/migrations/20260509000032_notifications.sql
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text,
  title       text,
  body        text,
  link        text,
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table notifications enable row level security;

create policy "notifications_own" on notifications
  for all using (user_id = auth.uid());

create index notifications_user_unread
  on notifications(user_id, read, created_at desc);
```

- [ ] **Step 4: Criar migration wa_suggestions**

```sql
-- supabase/migrations/20260509000033_wa_suggestions.sql
create table if not exists wa_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references clients(id) on delete cascade,
  user_id            uuid references auth.users(id),
  instance_id        uuid references pipeline_whatsapp_instances(id),
  inbound_message    text,
  suggested_response text,
  status             text default 'pending' check (status in ('pending','done','error')),
  run_id             text,
  created_at         timestamptz default now()
);

alter table wa_suggestions enable row level security;

create policy "wa_suggestions_user_own" on wa_suggestions
  for select using (user_id = auth.uid());
```

- [ ] **Step 5: Aplicar migrations**

```bash
npx supabase db push
```

Verificar no Supabase Studio que as 4 tabelas existem com as colunas corretas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260509000030_wa_feedbacks.sql supabase/migrations/20260509000031_wa_analysis_settings.sql supabase/migrations/20260509000032_notifications.sql supabase/migrations/20260509000033_wa_suggestions.sql
git commit -m "feat(db): tabelas wa_feedbacks, wa_analysis_settings, notifications, wa_suggestions"
```

---

## Task 2: Edge Function `analyze-wa-conversation`

**Files:**
- Criar: `supabase/functions/analyze-wa-conversation/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/analyze-wa-conversation/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENCLAW_URL = Deno.env.get("OPENCLAW_URL")!;
const OPENCLAW_TOKEN = Deno.env.get("OPENCLAW_HOOKS_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
}

function formatThread(messages: { direction: string; message_text: string; created_at: string }[]) {
  return messages.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dir  = m.direction === "inbound" ? "CLIENTE" : "ATENDENTE";
    return `${time} [${dir}] ${m.message_text}`;
  }).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Autenticação do chamador (usuário ou pg_cron via service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sbUser.auth.getUser();
  // Aceita chamada autenticada de usuário OU com service role key diretamente
  const isServiceRole = authHeader.includes(SERVICE_KEY);
  if (!user && !isServiceRole) return json({ error: "Unauthorized" }, 401);

  const { client_id, user_id } = await req.json();
  if (!client_id) return json({ error: "client_id obrigatório" }, 400);

  // 1. Buscar settings
  const { data: settings } = await sbAdmin
    .from("wa_analysis_settings")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();
  const agentId = settings?.agent_id ?? "agente-feedback-wa";
  const threshold = settings?.alert_threshold ?? 5.0;

  // 2. Buscar thread
  const { data: messages } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at, instance_id, pipeline_whatsapp_instances(user_id)")
    .eq("client_id", client_id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!messages || messages.length === 0) {
    return json({ error: "Nenhuma mensagem encontrada para este cliente" }, 404);
  }

  const instanceUserId = (messages[0] as any).pipeline_whatsapp_instances?.user_id ?? user_id ?? user?.id;
  const instanceId = (messages[0] as any).instance_id ?? null;
  const thread = formatThread(messages);

  // 3. Montar prompt
  const prompt = `Você é um analista de qualidade de atendimento. Analise a conversa de WhatsApp abaixo entre um atendente e um cliente.

Retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois:
{
  "score_overall": <número 0-10>,
  "score_response_time": <número 0-10>,
  "score_tone": <número 0-10>,
  "score_commercial": <número 0-10>,
  "alert_level": "<ok|warning|critical>",
  "summary": "<resumo em 2 frases>",
  "recommendations": ["<rec1>", "<rec2>"]
}

Critérios:
- score_response_time: velocidade e consistência das respostas do atendente
- score_tone: educação, clareza e profissionalismo
- score_commercial: avanço no funil, aproveitamento de oportunidade comercial
- score_overall: média ponderada (tone 40%, commercial 35%, response_time 25%)
- alert_level: "critical" se score_overall < ${threshold}, "warning" se < ${threshold + 2}, "ok" caso contrário

CONVERSA:
${thread}`;

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-feedback-webhook`;
  const runName = `feedback-wa-${client_id.slice(0, 8)}-${Date.now()}`;

  // 4. Chamar OpenClaw
  const hookRes = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: prompt,
      agentId,
      deliver: "webhook",
      to: webhookUrl,
      thinking: "low",
      timeoutSeconds: 120,
      name: runName,
    }),
  });

  if (!hookRes.ok) {
    const err = await hookRes.text();
    return json({ error: `OpenClaw error: ${err}` }, 502);
  }

  const { runId } = await hookRes.json();

  // 5. Inserir wa_feedbacks pending
  await sbAdmin.from("wa_feedbacks").insert({
    client_id,
    user_id: instanceUserId,
    instance_id: instanceId,
    status: "pending",
    run_id: runId,
  });

  return json({ ok: true, run_id: runId });
});
```

- [ ] **Step 2: Verificar que o arquivo foi criado e a sintaxe está correta**

```bash
deno check supabase/functions/analyze-wa-conversation/index.ts
```

Se `deno` não estiver instalado, inspecionar visualmente por erros de sintaxe.

- [ ] **Step 3: Deploy da função**

```bash
npx supabase functions deploy analyze-wa-conversation --no-verify-jwt
```

*Nota: `--no-verify-jwt` porque pg_cron vai chamar sem JWT de usuário.*

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/analyze-wa-conversation/index.ts
git commit -m "feat(edge): analyze-wa-conversation — dispara análise no OpenClaw"
```

---

## Task 3: Edge Function `wa-feedback-webhook`

**Files:**
- Criar: `supabase/functions/wa-feedback-webhook/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/wa-feedback-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("OPENCLAW_WEBHOOK_SECRET") ?? "";

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function parseAgentOutput(raw: string) {
  // Parser defensivo — LLM pode retornar JSON dentro de markdown
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // Valida secret se configurado
  if (WEBHOOK_SECRET) {
    const secret = req.headers.get("X-Openclaw-Secret") ?? "";
    if (secret !== WEBHOOK_SECRET) return json({ error: "Forbidden" }, 403);
  }

  const body = await req.json();

  // OpenClaw envia o resultado em algum destes campos
  const raw: string = body.output ?? body.text ?? body.message ?? body.result ?? "";
  const runId: string = body.runId ?? body.run_id ?? "";

  if (!runId) return json({ error: "runId ausente no payload" }, 400);

  // Buscar feedback pending por run_id
  const { data: feedback } = await sbAdmin
    .from("wa_feedbacks")
    .select("id, user_id")
    .eq("run_id", runId)
    .eq("status", "pending")
    .maybeSingle();

  if (!feedback) {
    // Pode ser uma sugestão — tentar wa_suggestions
    const { data: suggestion } = await sbAdmin
      .from("wa_suggestions")
      .select("id")
      .eq("run_id", runId)
      .eq("status", "pending")
      .maybeSingle();

    if (suggestion) {
      const text = raw.trim();
      await sbAdmin
        .from("wa_suggestions")
        .update({ suggested_response: text, status: text ? "done" : "error" })
        .eq("id", suggestion.id);
      return json({ ok: true });
    }

    return json({ error: "run_id não encontrado" }, 404);
  }

  // Parsear JSON do feedback
  const data = parseAgentOutput(raw);

  if (!data) {
    await sbAdmin
      .from("wa_feedbacks")
      .update({ status: "error", raw_response: raw })
      .eq("id", feedback.id);
    return json({ ok: true, warning: "parse falhou — raw_response salvo" });
  }

  const {
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary, recommendations,
  } = data;

  await sbAdmin.from("wa_feedbacks").update({
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary,
    recommendations: JSON.stringify(recommendations ?? []),
    status: "done",
    raw_response: raw,
  }).eq("id", feedback.id);

  // Disparar alertas se critical
  if (alert_level === "critical" && feedback.user_id) {
    const { data: feedbackFull } = await sbAdmin
      .from("wa_feedbacks")
      .select("client_id, wa_feedbacks_clients:clients(name, phone)")
      .eq("id", feedback.id)
      .maybeSingle();

    const clientName = (feedbackFull as any)?.wa_feedbacks_clients?.name
      ?? (feedbackFull as any)?.wa_feedbacks_clients?.phone
      ?? "cliente";

    const notifBase = {
      type: "wa_feedback_alert",
      title: "⚠️ Conversa crítica detectada",
      body: `A conversa com ${clientName} foi avaliada abaixo do threshold. Nota: ${score_overall}`,
      link: `/minhas-conversas-wa`,
    };

    // Notificar usuário
    await sbAdmin.from("notifications").insert({ ...notifBase, user_id: feedback.user_id });

    // Notificar todos admins
    const { data: admins } = await sbAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "master_admin"]);

    if (admins && admins.length > 0) {
      const adminNotifs = admins
        .filter((a: { user_id: string }) => a.user_id !== feedback.user_id)
        .map((a: { user_id: string }) => ({
          ...notifBase,
          user_id: a.user_id,
          link: `/admin/conversas`,
        }));
      if (adminNotifs.length > 0) {
        await sbAdmin.from("notifications").insert(adminNotifs);
      }
    }
  }

  return json({ ok: true });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy wa-feedback-webhook --no-verify-jwt
```

- [ ] **Step 3: Teste manual**

Enviar uma requisição POST simulando o callback do OpenClaw:

```bash
curl -X POST https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/wa-feedback-webhook \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{
    "runId": "teste-123",
    "output": "{\"score_overall\": 8.5, \"score_response_time\": 9, \"score_tone\": 8, \"score_commercial\": 8.5, \"alert_level\": \"ok\", \"summary\": \"Atendimento profissional.\", \"recommendations\": [\"Responder mais rápido\"]}"
  }'
```

Esperado: `{ "ok": true }`. Verificar no banco que o registro foi atualizado (se existir um wa_feedbacks com run_id="teste-123").

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/wa-feedback-webhook/index.ts
git commit -m "feat(edge): wa-feedback-webhook — recebe callback OpenClaw, parseia scores, dispara alertas"
```

---

## Task 4: Edge Function `suggest-wa-response`

**Files:**
- Criar: `supabase/functions/suggest-wa-response/index.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/suggest-wa-response/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENCLAW_URL    = Deno.env.get("OPENCLAW_URL")!;
const OPENCLAW_TOKEN  = Deno.env.get("OPENCLAW_HOOKS_TOKEN")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { client_id, inbound_text } = await req.json();
  if (!client_id || !inbound_text) {
    return json({ error: "client_id e inbound_text são obrigatórios" }, 400);
  }

  // Buscar instância do usuário
  const { data: instance } = await sbAdmin
    .from("pipeline_whatsapp_instances")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  // Buscar últimas 10 mensagens do cliente
  const { data: history } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at")
    .eq("client_id", client_id)
    .order("created_at", { ascending: false })
    .limit(10);

  const chronological = (history ?? []).reverse();

  const historyText = chronological.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const dir  = m.direction === "inbound" ? "CLIENTE" : "ATENDENTE";
    return `${time} [${dir}] ${m.message_text}`;
  }).join("\n");

  const prompt = `Você é um assistente de vendas e atendimento da Live Equipamentos, fabricante de equipamentos de Pilates com IA embarcada.
Analise a conversa abaixo e sugira UMA resposta para a última mensagem recebida do lead/cliente.
Seja direto, profissional e natural. Retorne APENAS o texto da resposta, sem explicações, sem aspas, sem prefixos.

HISTÓRICO DA CONVERSA:
${historyText}

ÚLTIMA MENSAGEM DO LEAD:
${inbound_text}`;

  const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-feedback-webhook`;
  const runName = `suggest-wa-${client_id.slice(0, 8)}-${Date.now()}`;

  const hookRes = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENCLAW_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: prompt,
      agentId: "agente-feedback-wa",
      deliver: "webhook",
      to: webhookUrl,
      thinking: "low",
      timeoutSeconds: 60,
      name: runName,
    }),
  });

  if (!hookRes.ok) {
    const err = await hookRes.text();
    return json({ error: `OpenClaw error: ${err}` }, 502);
  }

  const { runId } = await hookRes.json();

  // Inserir suggestion pending
  const { data: suggestion } = await sbAdmin
    .from("wa_suggestions")
    .insert({
      client_id,
      user_id: user.id,
      instance_id: instance?.id ?? null,
      inbound_message: inbound_text,
      status: "pending",
      run_id: runId,
    })
    .select("id")
    .single();

  return json({ ok: true, suggestion_id: suggestion?.id, run_id: runId });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy suggest-wa-response
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/suggest-wa-response/index.ts
git commit -m "feat(edge): suggest-wa-response — solicita sugestão de resposta ao OpenClaw"
```

---

## Task 5: Edge Function `wa-suggestion-webhook`

A função `wa-feedback-webhook` (Task 3) já trata sugestões (verifica `wa_suggestions` quando `wa_feedbacks` não é encontrado). Não é necessária uma função separada — o webhook compartilhado já funciona para os dois casos pelo `run_id`.

- [ ] **Step 1: Verificar que o webhook compartilhado cobre sugestões**

Reler o código de `wa-feedback-webhook/index.ts` na seção `// Pode ser uma sugestão`. Confirmar que:
- Busca `wa_suggestions` quando `wa_feedbacks` não encontrado pelo `run_id`
- Atualiza `suggested_response` e `status: "done"` com o texto bruto (sem parse JSON)

- [ ] **Step 2: Commit (sem alteração — apenas confirmação de cobertura)**

```bash
git commit --allow-empty -m "chore: wa-suggestion-webhook coberto pelo wa-feedback-webhook (run_id compartilhado)"
```

---

## Task 6: Hook `useNotifications` + sino no header

**Files:**
- Criar: `src/hooks/useNotifications.ts`
- Modificar: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Criar hook useNotifications**

```typescript
// src/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Notification[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read: true }).eq("read", false);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return { notifications, unreadCount, markRead: markRead.mutate, markAllRead: markAllRead.mutate };
}
```

- [ ] **Step 2: Atualizar AppLayout.tsx — substituir o botão estático do sino**

Localizar o trecho em `src/components/layout/AppLayout.tsx` (linhas ~85-88):
```tsx
<button className="relative p-2 rounded-lg hover:bg-zinc-800 transition-colors">
  <Bell className="h-4 w-4 text-zinc-400" />
  <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full" />
</button>
```

Substituir por:

```tsx
// Adicionar imports no topo do arquivo:
// import { useNotifications } from "@/hooks/useNotifications";
// import { useNavigate } from "react-router-dom"; // já importado
// import { format } from "date-fns"; // adicionar se não tiver

// Dentro de AppLayout, após as declarações de hooks existentes:
const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
const [notifOpen, setNotifOpen] = useState(false);

// Substituir o botão do sino por:
<Popover open={notifOpen} onOpenChange={setNotifOpen}>
  <PopoverTrigger asChild>
    <button className="relative p-2 rounded-lg hover:bg-zinc-800 transition-colors">
      <Bell className="h-4 w-4 text-zinc-400" />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  </PopoverTrigger>
  <PopoverContent align="end" className="w-80 p-0 max-h-96 overflow-hidden flex flex-col">
    <div className="flex items-center justify-between px-4 py-2 border-b">
      <span className="text-sm font-semibold">Notificações</span>
      {unreadCount > 0 && (
        <button
          onClick={() => markAllRead()}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Marcar tudo como lido
        </button>
      )}
    </div>
    <div className="overflow-y-auto flex-1">
      {notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma notificação
        </p>
      ) : (
        notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              markRead(n.id);
              setNotifOpen(false);
              if (n.link) navigate(n.link);
            }}
            className={`w-full text-left px-4 py-3 border-b hover:bg-muted transition-colors ${
              !n.read ? "bg-blue-50" : ""
            }`}
          >
            <p className="text-sm font-medium">{n.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
          </button>
        ))
      )}
    </div>
  </PopoverContent>
</Popover>
```

Adicionar `useState` ao import do React: `import { useState } from "react";`

- [ ] **Step 3: Verificar compilação**

```bash
npm run typecheck 2>&1 | head -30
```

Esperado: sem erros em AppLayout.tsx ou useNotifications.ts.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useNotifications.ts src/components/layout/AppLayout.tsx
git commit -m "feat(ui): sino de notificações funcional com badge e dropdown"
```

---

## Task 7: Componente compartilhado `WaFeedbackPanel`

**Files:**
- Criar: `src/components/wa/WaFeedbackPanel.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/wa/WaFeedbackPanel.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, Brain, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface WaFeedback {
  id: string;
  score_overall: number | null;
  score_response_time: number | null;
  score_tone: number | null;
  score_commercial: number | null;
  summary: string | null;
  recommendations: string[];
  alert_level: "ok" | "warning" | "critical" | null;
  status: "pending" | "done" | "error";
  created_at: string;
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = (value / 10) * 100;
  const color = value >= 7 ? "bg-emerald-500" : value >= 5 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AlertBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const map = {
    ok: { icon: CheckCircle, label: "Bom", class: "text-emerald-600 bg-emerald-50" },
    warning: { icon: AlertTriangle, label: "Atenção", class: "text-amber-600 bg-amber-50" },
    critical: { icon: AlertTriangle, label: "Crítico", class: "text-red-600 bg-red-50" },
  } as const;
  const cfg = map[level as keyof typeof map];
  if (!cfg) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.class)}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

interface WaFeedbackPanelProps {
  clientId: string;
  canAnalyze?: boolean; // admin pode sempre; usuário apenas na própria conversa
  onAnalyze?: () => void;
}

export function WaFeedbackPanel({ clientId, canAnalyze = true }: WaFeedbackPanelProps) {
  const [open, setOpen] = useState(true);
  const qc = useQueryClient();

  const { data: feedback, isLoading } = useQuery<WaFeedback | null>({
    queryKey: ["wa-feedback", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("wa_feedbacks")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      return {
        ...data,
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      } as WaFeedback;
    },
    refetchInterval: (data) => (data?.status === "pending" ? 5_000 : false),
  });

  const analyze = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("analyze-wa-conversation", {
        body: { client_id: clientId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Análise iniciada — resultado em ~20s");
      qc.invalidateQueries({ queryKey: ["wa-feedback", clientId] });
    },
    onError: () => toast.error("Erro ao iniciar análise"),
  });

  const showAnalyzeBtn = canAnalyze && (!feedback || feedback.status === "error");
  const isPending = feedback?.status === "pending";

  return (
    <div className="border-t bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Análise IA
          {feedback?.alert_level && <AlertBadge level={feedback.alert_level} />}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando análise...
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Clock className="h-4 w-4 animate-pulse" /> Análise em andamento...
            </div>
          )}

          {feedback?.status === "done" && (
            <>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-2xl font-bold",
                  (feedback.score_overall ?? 0) >= 7 ? "text-emerald-600"
                  : (feedback.score_overall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                )}>
                  {feedback.score_overall?.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">/10</span>
                <AlertBadge level={feedback.alert_level} />
              </div>

              <div className="space-y-2">
                <ScoreBar label="Tempo de resposta" value={feedback.score_response_time} />
                <ScoreBar label="Tom e profissionalismo" value={feedback.score_tone} />
                <ScoreBar label="Aproveitamento comercial" value={feedback.score_commercial} />
              </div>

              {feedback.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">{feedback.summary}</p>
              )}

              {feedback.recommendations.length > 0 && (
                <ul className="space-y-1">
                  {feedback.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                {format(new Date(feedback.created_at), "dd/MM HH:mm", { locale: ptBR })}
              </p>
            </>
          )}

          {!isLoading && !feedback && !isPending && (
            <p className="text-xs text-muted-foreground">
              Nenhuma análise nas últimas 24h.
            </p>
          )}

          {showAnalyzeBtn && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs h-7"
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
            >
              {analyze.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Iniciando...</>
                : <><Brain className="h-3 w-3" /> Analisar agora</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar compilação**

```bash
npm run typecheck 2>&1 | grep WaFeedbackPanel
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/wa/WaFeedbackPanel.tsx
git commit -m "feat(ui): WaFeedbackPanel — card de análise IA reutilizável"
```

---

## Task 8: MinhasConversasWAPage — adicionar painel de feedback

**Files:**
- Modificar: `src/pages/MinhasConversasWAPage.tsx`

- [ ] **Step 1: Importar WaFeedbackPanel e adicionar abaixo do thread**

No topo do arquivo, adicionar:
```tsx
import { WaFeedbackPanel } from "@/components/wa/WaFeedbackPanel";
```

Localizar o fechamento do `<div ref={threadRef} ...>` (a div das mensagens) e adicionar o painel logo após, dentro do fragmento `<>`:

```tsx
{/* Após a div de mensagens, antes do fechamento do <> */}
{selectedClientId && (
  <WaFeedbackPanel clientId={selectedClientId} canAnalyze={true} />
)}
```

- [ ] **Step 2: Verificar compilação e abrir no browser**

```bash
npm run dev
```

Navegar para `/minhas-conversas-wa`, selecionar uma conversa. O painel "Análise IA" deve aparecer abaixo das mensagens com botão "Analisar agora".

- [ ] **Step 3: Commit**

```bash
git add src/pages/MinhasConversasWAPage.tsx
git commit -m "feat(ui): MinhasConversasWAPage — painel WaFeedbackPanel integrado"
```

---

## Task 9: AdminConversasPage — adicionar painel de feedback

**Files:**
- Modificar: `src/pages/AdminConversasPage.tsx`

- [ ] **Step 1: Importar WaFeedbackPanel e adicionar após o thread**

No topo do arquivo, adicionar:
```tsx
import { WaFeedbackPanel } from "@/components/wa/WaFeedbackPanel";
```

Na seção de mensagens do painel direito, após o fechamento da `<div ref={threadRef}>` e antes do fechamento do `<>`:

```tsx
{selectedClientId && (
  <WaFeedbackPanel clientId={selectedClientId} canAnalyze={true} />
)}
```

- [ ] **Step 2: Verificar no browser**

Navegar para `/admin/conversas`, selecionar uma conversa. O painel deve aparecer com a opção de forçar análise.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AdminConversasPage.tsx
git commit -m "feat(ui): AdminConversasPage — painel WaFeedbackPanel para admin"
```

---

## Task 10: Página `MeuDesempenhoWAPage`

**Files:**
- Criar: `src/pages/MeuDesempenhoWAPage.tsx`

- [ ] **Step 1: Instalar recharts se necessário**

```bash
npm list recharts 2>&1 | head -3
```

Se não estiver instalado: `npm install recharts`. Se já estiver, pular.

- [ ] **Step 2: Criar a página**

```tsx
// src/pages/MeuDesempenhoWAPage.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart3, TrendingUp, AlertTriangle, MessageSquare } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface WaFeedback {
  id: string;
  client_id: string;
  score_overall: number | null;
  score_response_time: number | null;
  score_tone: number | null;
  score_commercial: number | null;
  summary: string | null;
  alert_level: string | null;
  status: string;
  created_at: string;
  clients: { name: string | null; phone: string | null } | null;
}

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function avg(vals: (number | null)[]) {
  const nums = vals.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  const color = value === null ? "text-muted-foreground"
    : value >= 7 ? "text-emerald-600" : value >= 5 ? "text-amber-500" : "text-red-600";
  return (
    <div className="bg-white border rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold", color)}>
        {value !== null ? value.toFixed(1) : "—"}
      </p>
    </div>
  );
}

export default function MeuDesempenhoWAPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(30);

  const since = useMemo(() => subDays(new Date(), period).toISOString(), [period]);

  const { data: feedbacks = [], isLoading } = useQuery<WaFeedback[]>({
    queryKey: ["meu-desempenho-wa", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_feedbacks")
        .select("id, client_id, score_overall, score_response_time, score_tone, score_commercial, summary, alert_level, status, created_at, clients(name, phone)")
        .eq("status", "done")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WaFeedback[];
    },
    staleTime: 60_000,
  });

  const done = feedbacks.filter((f) => f.status === "done");
  const avgOverall = avg(done.map((f) => f.score_overall));
  const avgTime    = avg(done.map((f) => f.score_response_time));
  const avgTone    = avg(done.map((f) => f.score_tone));
  const avgComm    = avg(done.map((f) => f.score_commercial));
  const alertCount = done.filter((f) => f.alert_level === "critical").length;

  const chartData = done.map((f) => ({
    date: format(new Date(f.created_at), "dd/MM"),
    nota: f.score_overall !== null ? Number(f.score_overall.toFixed(1)) : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu Desempenho WhatsApp"
        description="Evolução das análises de qualidade das suas conversas"
        icon={BarChart3}
      />

      {/* Seletor de período */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant={period === p.days ? "default" : "outline"}
            onClick={() => setPeriod(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Cards de média */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ScoreCard label="Nota geral" value={avgOverall} />
        <ScoreCard label="Tempo de resposta" value={avgTime} />
        <ScoreCard label="Tom e profissionalismo" value={avgTone} />
        <ScoreCard label="Aproveitamento comercial" value={avgComm} />
      </div>

      {alertCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {alertCount} conversa{alertCount !== 1 ? "s" : ""} crítica{alertCount !== 1 ? "s" : ""} no período
        </div>
      )}

      {/* Gráfico de evolução */}
      {chartData.length > 1 && (
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução da nota geral
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}`, "Nota"]} />
              <Line
                type="monotone" dataKey="nota" stroke="#10b981"
                strokeWidth={2} dot={{ r: 3 }} connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de feedbacks */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-medium">Histórico de análises</p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
        ) : done.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma análise concluída no período.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Cliente</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-muted-foreground">Nota</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Resumo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...done].reverse().map((f) => (
                <tr key={f.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(f.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {(f.clients as any)?.name || (f.clients as any)?.phone || "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={cn(
                      "font-bold text-sm",
                      (f.score_overall ?? 0) >= 7 ? "text-emerald-600"
                      : (f.score_overall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                    )}>
                      {f.score_overall?.toFixed(1) ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                    {f.summary}
                  </td>
                  <td className="px-4 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs gap-1"
                      onClick={() => navigate(`/minhas-conversas-wa`)}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Ver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/MeuDesempenhoWAPage.tsx
git commit -m "feat(ui): MeuDesempenhoWAPage — gráfico de evolução e histórico de feedbacks"
```

---

## Task 11: Página `AdminDesempenhoWAPage`

**Files:**
- Criar: `src/pages/AdminDesempenhoWAPage.tsx`

- [ ] **Step 1: Criar a página**

```tsx
// src/pages/AdminDesempenhoWAPage.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart3, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface WaFeedback {
  id: string;
  user_id: string | null;
  client_id: string;
  score_overall: number | null;
  score_response_time: number | null;
  score_tone: number | null;
  score_commercial: number | null;
  summary: string | null;
  alert_level: string | null;
  status: string;
  created_at: string;
  clients: { name: string | null; phone: string | null } | null;
}

interface Profile { user_id: string; full_name: string | null; email: string | null; }

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function avg(vals: (number | null)[]) {
  const nums = vals.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export default function AdminDesempenhoWAPage() {
  const [period, setPeriod] = useState(30);
  const [expanded, setExpanded] = useState<string | null>(null);

  const since = useMemo(() => subDays(new Date(), period).toISOString(), [period]);

  const { data: feedbacks = [] } = useQuery<WaFeedback[]>({
    queryKey: ["admin-desempenho-wa", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_feedbacks")
        .select("id, user_id, client_id, score_overall, score_response_time, score_tone, score_commercial, summary, alert_level, status, created_at, clients(name, phone)")
        .eq("status", "done")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WaFeedback[];
    },
    staleTime: 60_000,
  });

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name, email");
      return (data || []) as Profile[];
    },
    staleTime: 300_000,
  });

  const profileName = (uid: string | null) => {
    if (!uid) return "Sem usuário";
    const p = profiles.find((x) => x.user_id === uid);
    return p?.full_name || p?.email || uid.slice(0, 8);
  };

  // Agrupar feedbacks por user_id
  const byUser = useMemo(() => {
    const map = new Map<string, WaFeedback[]>();
    for (const f of feedbacks) {
      const key = f.user_id ?? "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries())
      .map(([uid, fbs]) => ({
        uid,
        name: profileName(uid === "__none__" ? null : uid),
        feedbacks: fbs,
        avgOverall: avg(fbs.map((f) => f.score_overall)),
        alertCount: fbs.filter((f) => f.alert_level === "critical").length,
      }))
      .sort((a, b) => (a.avgOverall ?? 0) - (b.avgOverall ?? 0)); // piores primeiro
  }, [feedbacks, profiles]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Desempenho WhatsApp"
        description="Análise comparativa de desempenho entre usuários"
        icon={BarChart3}
      />

      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant={period === p.days ? "default" : "outline"}
            onClick={() => setPeriod(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Usuário</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Análises</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Nota média</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Alertas críticos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {byUser.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma análise concluída no período.
                </td>
              </tr>
            )}
            {byUser.map(({ uid, name, feedbacks: fbs, avgOverall, alertCount }) => (
              <>
                <tr
                  key={uid}
                  className="border-t hover:bg-muted/20 cursor-pointer"
                  onClick={() => setExpanded(expanded === uid ? null : uid)}
                >
                  <td className="px-4 py-3 font-medium">{name}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{fbs.length}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn(
                      "font-bold",
                      (avgOverall ?? 0) >= 7 ? "text-emerald-600"
                      : (avgOverall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                    )}>
                      {avgOverall !== null ? avgOverall.toFixed(1) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {alertCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {alertCount}
                      </span>
                    )}
                    {alertCount === 0 && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {expanded === uid
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground inline" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground inline" />}
                  </td>
                </tr>

                {expanded === uid && fbs.map((f) => (
                  <tr key={f.id} className="bg-muted/10 border-t">
                    <td className="pl-8 pr-4 py-2 text-xs text-muted-foreground">
                      {format(new Date(f.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      {" · "}
                      {(f.clients as any)?.name || (f.clients as any)?.phone || "—"}
                    </td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-center">
                      <span className={cn(
                        "text-xs font-bold",
                        (f.score_overall ?? 0) >= 7 ? "text-emerald-600"
                        : (f.score_overall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                      )}>
                        {f.score_overall?.toFixed(1) ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {f.alert_level === "critical" && (
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 inline" />
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                      {f.summary}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AdminDesempenhoWAPage.tsx
git commit -m "feat(ui): AdminDesempenhoWAPage — ranking de desempenho por usuário"
```

---

## Task 12: SettingsPage — aba "WhatsApp IA"

**Files:**
- Modificar: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Localizar onde ficam as abas no SettingsPage**

Abrir `src/pages/SettingsPage.tsx` e localizar o componente `<TabsList>` e `<TabsContent>`. As abas são identificadas por valores como `"geral"`, `"whatsapp"`, etc.

- [ ] **Step 2: Adicionar aba "WhatsApp IA" na TabsList**

Dentro de `<TabsList>`, adicionar após o item de WhatsApp existente:
```tsx
<TabsTrigger value="whatsapp-ia">WhatsApp IA</TabsTrigger>
```

- [ ] **Step 3: Adicionar TabsContent com as configurações**

Após o último `</TabsContent>`, antes do fechamento do `<Tabs>`:

```tsx
<TabsContent value="whatsapp-ia" className="space-y-6">
  <WaIaSettings />
</TabsContent>
```

- [ ] **Step 4: Criar o componente WaIaSettings inline no SettingsPage**

Adicionar antes do export default da SettingsPage:

```tsx
function WaIaSettings() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["wa_analysis_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wa_analysis_settings")
        .select("*")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .single();
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: {
      trigger_type: string;
      schedule_cron: string;
      alert_threshold: number;
    }) => {
      const { error } = await supabase
        .from("wa_analysis_settings")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", "00000000-0000-0000-0000-000000000001");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações de IA salvas");
      qc.invalidateQueries({ queryKey: ["wa_analysis_settings"] });
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  const [triggerType, setTriggerType] = useState("manual");
  const [scheduleTime, setScheduleTime] = useState("22:00");
  const [threshold, setThreshold] = useState(5.0);

  // Sincronizar com dados carregados — useEffect (não useState)
  useEffect(() => {
    if (!settings) return;
    setTriggerType(settings.trigger_type ?? "manual");
    if (settings.schedule_cron) {
      const parts = settings.schedule_cron.split(" ");
      if (parts.length >= 2) {
        setScheduleTime(`${parts[1].padStart(2,"0")}:${parts[0].padStart(2,"0")}`);
      }
    }
    setThreshold(Number(settings.alert_threshold) ?? 5.0);
  }, [settings]);

  const handleSave = () => {
    const [hh, mm] = scheduleTime.split(":").map(Number);
    const cron = `${mm} ${hh} * * *`;
    save.mutate({ trigger_type: triggerType, schedule_cron: cron, alert_threshold: threshold });
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-sm font-semibold mb-4">Análise automática de conversas</h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Modo de análise</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (botão na conversa)</SelectItem>
                <SelectItem value="scheduled">Agendado (horário fixo)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {triggerType === "scheduled" && (
            <div className="space-y-2">
              <Label>Horário da análise diária</Label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Analisa conversas do dia anterior automaticamente neste horário.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Threshold de alerta crítico: <strong>{threshold.toFixed(1)}</strong></Label>
            <input
              type="range" min="0" max="10" step="0.5"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Conversas com nota abaixo de {threshold.toFixed(1)} disparam alerta para o usuário e todos os admins.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground">Agente IA</Label>
            <p className="text-sm font-mono bg-muted px-3 py-1.5 rounded">
              {settings?.agent_id ?? "agente-feedback-wa"}
            </p>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={save.isPending}>
        {save.isPending ? "Salvando..." : "Salvar configurações"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Verificar compilação**

```bash
npm run typecheck 2>&1 | grep SettingsPage
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(ui): SettingsPage — aba WhatsApp IA com threshold e agendamento"
```

---

## Task 13: Rotas, Sidebar e crmModules

**Files:**
- Modificar: `src/App.tsx`
- Modificar: `src/components/layout/AppSidebar.tsx`
- Modificar: `src/lib/crmModules.ts`

- [ ] **Step 1: Adicionar lazy imports em App.tsx**

```tsx
const MeuDesempenhoWAPage = lazy(() => import("./pages/MeuDesempenhoWAPage"));
const AdminDesempenhoWAPage = lazy(() => import("./pages/AdminDesempenhoWAPage"));
```

- [ ] **Step 2: Adicionar rotas em App.tsx**

```tsx
<Route path="/meu-desempenho-wa" element={<MeuDesempenhoWAPage />} />
<Route path="/admin/desempenho-wa" element={<AdminDesempenhoWAPage />} />
```

- [ ] **Step 3: Adicionar itens no AppSidebar.tsx**

Em `operationsNav`, após o item "Minhas Conversas WA":
```tsx
{ title: "Meu Desempenho WA", url: "/meu-desempenho-wa", icon: BarChart3, moduleKey: "meu_desempenho_wa" },
```

Em `adminNav`, após "Conversas WA":
```tsx
{ title: "Desempenho WA",     url: "/admin/desempenho-wa", icon: BarChart3, moduleKey: null },
```

Verificar que `BarChart3` já está nos imports (já está — linha 12 do arquivo original).

- [ ] **Step 4: Adicionar em crmModules.ts**

```tsx
{ key: "meu_desempenho_wa", label: "Meu Desempenho WA", section: "Operações" },
```

- [ ] **Step 5: Verificar compilação**

```bash
npm run typecheck 2>&1 | head -20
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/layout/AppSidebar.tsx src/lib/crmModules.ts
git commit -m "feat(routing): rotas e sidebar para MeuDesempenhoWA e AdminDesempenhoWA"
```

---

## Task 14: Extension — background.js — sugestões de resposta

**Files:**
- Modificar: `livecrm-extension/background.js`

- [ ] **Step 1: Adicionar função requestSuggestion e variável de controle**

Após as declarações de variáveis globais no topo do background.js (após `const dispatchTimeouts`), adicionar:

```javascript
// Controle de sugestões — evita disparar múltiplos requests para a mesma mensagem
let lastSuggestionMsgId = null;
let suggestionPollInterval = null;

async function requestSuggestion(phone, inboundText, clientId) {
  if (!sb) return;

  // Buscar sessão para obter access_token
  const stored = await getStored(['session']);
  if (!stored.session?.access_token) return;

  const body = JSON.stringify({ client_id: clientId, inbound_text: inboundText });

  let resp;
  try {
    resp = await fetch(`${SUPABASE_URL}/functions/v1/suggest-wa-response`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${stored.session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body,
    });
  } catch (e) {
    console.warn('[LiveCRM BG] suggest-wa-response fetch error:', e.message);
    return;
  }

  if (!resp.ok) {
    console.warn('[LiveCRM BG] suggest-wa-response error:', resp.status);
    return;
  }

  const { suggestion_id } = await resp.json();
  if (!suggestion_id) return;

  console.log('[LiveCRM BG] sugestão pendente:', suggestion_id);

  // Notificar sidebar que está gerando
  const tab = await findWaTab();
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'SUGGESTION_PENDING' }).catch(() => {});
  }

  // Polling a cada 5s por até 60s
  let attempts = 0;
  if (suggestionPollInterval) clearInterval(suggestionPollInterval);

  suggestionPollInterval = setInterval(async () => {
    attempts++;
    if (attempts > 12) { // 60s
      clearInterval(suggestionPollInterval);
      const t = await findWaTab();
      if (t) chrome.tabs.sendMessage(t.id, { type: 'SUGGESTION_TIMEOUT' }).catch(() => {});
      return;
    }

    const { data } = await sb
      .from('wa_suggestions')
      .select('suggested_response, status')
      .eq('id', suggestion_id)
      .maybeSingle();

    if (!data || data.status === 'pending') return;

    clearInterval(suggestionPollInterval);
    const t = await findWaTab();
    if (!t) return;

    if (data.status === 'done' && data.suggested_response) {
      chrome.tabs.sendMessage(t.id, {
        type: 'SUGGESTION_READY',
        text: data.suggested_response,
      }).catch(() => {});
    } else {
      chrome.tabs.sendMessage(t.id, { type: 'SUGGESTION_TIMEOUT' }).catch(() => {});
    }
  }, 5000);
}
```

- [ ] **Step 2: Adicionar chamada a requestSuggestion no final de handleInbound**

Em background.js, localizar a função `handleInbound` (linha ~638). No final da função, após o bloco de insert com retry (após o último `}` do if `insertErr`), adicionar antes do fechamento da função:

```javascript
  // Disparar sugestão se temos clientId e texto
  if (clientId && text && text.trim() !== '') {
    const msgKey = waMessageId || (phone + '_' + Date.now());
    if (msgKey !== lastSuggestionMsgId) {
      lastSuggestionMsgId = msgKey;
      requestSuggestion(phone, text, clientId).catch(console.error);
    }
  }
```

As variáveis `clientId`, `text`, `phone` e `waMessageId` já existem nesse escopo (parâmetros e variáveis locais de handleInbound).

- [ ] **Step 3: Verificar no console do service worker**

Abrir `chrome://extensions`, clicar em "service worker" da extensão LiveCRM. Abrir uma conversa no WA Web e enviar uma mensagem de teste. Verificar logs `[LiveCRM BG] sugestão pendente:` e depois `SUGGESTION_READY` ou `SUGGESTION_TIMEOUT`.

- [ ] **Step 4: Commit**

```bash
git add livecrm-extension/background.js
git commit -m "feat(extension): background.js — requestSuggestion via suggest-wa-response + polling"
```

---

## Task 15: Extension — content_script.js — painel de sugestão no sidebar

**Files:**
- Modificar: `livecrm-extension/content_script.js`

- [ ] **Step 1: Adicionar variável global e função renderSuggestionPanel**

Após as declarações globais no topo do content_script.js (após `let activeObserver = null`):

```javascript
let currentSuggestionState = 'idle'; // idle | pending | done | timeout
let currentSuggestionText = '';

function renderSuggestionPanel() {
  const panel = document.getElementById('livecrm-suggestion-panel');
  if (!panel) return;

  panel.textContent = '';

  const header = document.createElement('div');
  Object.assign(header.style, {
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.5px',
    color: '#6b7280', marginBottom: '6px', fontWeight: '600',
  });
  header.textContent = '💬 Sugestão de resposta';
  panel.appendChild(header);

  if (currentSuggestionState === 'pending') {
    const msg = document.createElement('div');
    Object.assign(msg.style, { fontSize: '12px', color: '#d97706' });
    msg.textContent = '⟳ Gerando sugestão...';
    panel.appendChild(msg);
    return;
  }

  if (currentSuggestionState === 'timeout') {
    const msg = document.createElement('div');
    Object.assign(msg.style, { fontSize: '12px', color: '#9ca3af' });
    msg.textContent = 'Não foi possível gerar sugestão.';
    panel.appendChild(msg);
    return;
  }

  if (currentSuggestionState === 'done' && currentSuggestionText) {
    const textEl = document.createElement('div');
    Object.assign(textEl.style, {
      fontSize: '12px', color: '#111827', background: '#f0fdf4',
      border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 10px',
      marginBottom: '6px', lineHeight: '1.5',
    });
    textEl.textContent = currentSuggestionText;
    panel.appendChild(textEl);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copiar';
    Object.assign(copyBtn.style, {
      background: '#065f46', color: '#fff', border: 'none', borderRadius: '6px',
      padding: '5px 12px', fontSize: '12px', cursor: 'pointer', width: '100%',
    });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(currentSuggestionText).then(() => {
        copyBtn.textContent = '✓ Copiado!';
        setTimeout(() => { copyBtn.textContent = '📋 Copiar'; }, 2000);
      });
    });
    panel.appendChild(copyBtn);
    return;
  }

  // idle
  const msg = document.createElement('div');
  Object.assign(msg.style, { fontSize: '12px', color: '#9ca3af' });
  msg.textContent = 'Aguardando próxima mensagem...';
  panel.appendChild(msg);
}
```

- [ ] **Step 2: Adicionar o painel ao sidebar no renderSidebarData**

Localizar em `renderSidebarData` o final da função (antes do último fechamento, onde o body termina de ser populado). Adicionar o container da sugestão:

```javascript
// Painel de sugestão — adicionado ao final do body
const suggestionSection = document.createElement('div');
Object.assign(suggestionSection.style, {
  marginTop: '12px',
  borderTop: '1px solid #e5e7eb',
  paddingTop: '10px',
});
suggestionSection.id = 'livecrm-suggestion-panel';
body.appendChild(suggestionSection);

// Renderizar estado inicial
renderSuggestionPanel();
```

- [ ] **Step 3: Adicionar listener para mensagens do background**

Localizar onde `chrome.runtime.onMessage.addListener` é chamado no content_script.js (ou adicionar se não existir para este propósito). Adicionar os handlers:

```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SUGGESTION_PENDING') {
    currentSuggestionState = 'pending';
    currentSuggestionText = '';
    renderSuggestionPanel();
  } else if (message.type === 'SUGGESTION_READY') {
    currentSuggestionState = 'done';
    currentSuggestionText = message.text;
    renderSuggestionPanel();
  } else if (message.type === 'SUGGESTION_TIMEOUT') {
    currentSuggestionState = 'timeout';
    currentSuggestionText = '';
    renderSuggestionPanel();
  }
});
```

- [ ] **Step 4: Resetar estado ao trocar de conversa**

Localizar onde `sidebarCurrentPhone` é atualizado (ao mudar de conversa). Adicionar reset do estado de sugestão:

```javascript
// Ao mudar de conversa, resetar sugestão
currentSuggestionState = 'idle';
currentSuggestionText = '';
```

- [ ] **Step 5: Recarregar a extensão e testar**

1. `chrome://extensions` → recarregar a extensão LiveCRM
2. Abrir WA Web, abrir uma conversa com um contato cadastrado
3. Pedir ao contato (ou usar outro dispositivo) para enviar uma mensagem
4. Verificar que o sidebar mostra "⟳ Gerando sugestão..." em ~2s
5. Após ~10–20s, verificar que o texto aparece com botão "📋 Copiar"
6. Clicar "Copiar" e colar em algum lugar para confirmar o conteúdo

- [ ] **Step 6: Commit**

```bash
git add livecrm-extension/content_script.js
git commit -m "feat(extension): content_script — painel de sugestão de resposta no sidebar"
```

---

## Task 16: Deploy final e verificação end-to-end

- [ ] **Step 1: Build e deploy das Edge Functions restantes**

```bash
npx supabase functions deploy analyze-wa-conversation --no-verify-jwt
npx supabase functions deploy wa-feedback-webhook --no-verify-jwt
npx supabase functions deploy suggest-wa-response
```

- [ ] **Step 2: Setar env vars no Supabase**

Via `npx supabase secrets set`:

```bash
npx supabase secrets set OPENCLAW_URL=https://openclaw.liveuni.com.br
npx supabase secrets set OPENCLAW_HOOKS_TOKEN=<token do openclaw.json>
npx supabase secrets set OPENCLAW_WEBHOOK_SECRET=<string-aleatoria-segura>
```

- [ ] **Step 3: Teste end-to-end Feature 1 (Feedback)**

1. Navegar para `/minhas-conversas-wa` ou `/admin/conversas`
2. Selecionar uma conversa com mensagens
3. Clicar "Analisar agora" no painel Análise IA
4. Aguardar ~20s — o badge deve atualizar para "Pendente" e depois mostrar a nota
5. Verificar na tabela `wa_feedbacks` do Supabase Studio que o registro foi criado com `status: "done"`

- [ ] **Step 4: Teste end-to-end Feature 2 (Sugestões)**

1. Recarregar a extensão no Chrome
2. Abrir WA Web com conversa ativa
3. Receber uma mensagem inbound
4. Verificar que o sidebar mostra "⟳ Gerando sugestão..."
5. Após ~15s, verificar que a sugestão aparece com botão Copiar
6. Verificar na tabela `wa_suggestions` que `status: "done"` foi registrado

- [ ] **Step 5: Push para VPS**

```bash
git push origin main
```

No VPS: `git pull && bash deploy.sh` (conforme processo padrão do projeto).

- [ ] **Step 6: Verificar notificações de alerta**

Para testar sem esperar uma conversa ruim real, inserir diretamente no banco uma notificação:

```sql
insert into notifications (user_id, type, title, body, link)
values (
  '<seu user_id>',
  'wa_feedback_alert',
  '⚠️ Conversa crítica detectada',
  'A conversa com Cliente Teste foi avaliada com nota 3.2',
  '/minhas-conversas-wa'
);
```

Verificar que o sino no header mostra badge vermelho e que a notificação aparece no dropdown.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat: deploy final sistema WA AI feedback + sugestões de resposta"
```
