# Migração IA de WhatsApp: OpenClaw → OpenRouter (Claude) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o backend de IA das Edge Functions de WhatsApp do OpenClaw (assíncrono, via webhook) pelo OpenRouter chamando o Claude diretamente (síncrono).

**Architecture:** O OpenRouter expõe API HTTP síncrona compatível com OpenAI (`POST https://openrouter.ai/api/v1/chat/completions`). Cada Edge Function passa a chamar o OpenRouter, esperar a resposta do modelo e gravar o resultado em `wa_feedbacks`/`wa_suggestions` na mesma requisição. O callback assíncrono (`wa-feedback-webhook`) deixa de existir. A extensão Chrome não muda — a função grava `wa_suggestions` já com `status: 'done'` e o polling existente acha o resultado pronto.

**Tech Stack:** Deno + Supabase Edge Functions, OpenRouter API, Claude Sonnet 4.6 (feedback) e Claude Haiku 4.5 (copiloto), React + TanStack Query (frontend).

**Spec:** `docs/superpowers/specs/2026-05-18-openrouter-wa-ia-design.md`

**Nota sobre testes:** O repositório não tem harness de teste para Edge Functions Deno (nenhuma das ~9 edge functions existentes é testada). A verificação destas funções é manual, via `curl`, na Task 5 — seguindo a convenção do projeto. As mudanças de frontend são ajustes de texto verificados com `npm run build`.

---

## Task 1: Reescrever `analyze-wa-conversation` para OpenRouter

**Files:**
- Modify (substituir conteúdo inteiro): `supabase/functions/analyze-wa-conversation/index.ts`

- [ ] **Step 1: Substituir o arquivo inteiro pelo código abaixo**

```ts
// supabase/functions/analyze-wa-conversation/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

// Slug do modelo no OpenRouter — confirmar contra https://openrouter.ai/models
const MODEL = "anthropic/claude-sonnet-4.6";

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

// Parser defensivo — o modelo pode devolver JSON dentro de markdown
function parseAgentOutput(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!OPENROUTER_API_KEY) {
    console.error("[analyze-wa] OPENROUTER_API_KEY não configurado");
    return json({ error: "Configuração incompleta: OPENROUTER_API_KEY ausente" }, 500);
  }

  // Extrai usuário quando disponível (JWT na sessão do browser).
  // Não rejeita se null — função usa service_role para todas as ops de banco.
  const authHeader = req.headers.get("Authorization") ?? "";
  let userId: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sbUser.auth.getUser().catch(() => ({ data: { user: null } }));
    userId = user?.id ?? null;
  }

  let client_id: string, user_id: string | undefined;
  try {
    const body = await req.json();
    client_id = body.client_id;
    user_id = body.user_id;
  } catch {
    return json({ error: "Body JSON inválido" }, 400);
  }
  console.log("[analyze-wa] client_id:", client_id, "user_id:", user_id, "userId:", userId);
  if (!client_id) return json({ error: "client_id obrigatório" }, 400);

  // 1. Buscar settings (threshold de alerta)
  const { data: settings } = await sbAdmin
    .from("wa_analysis_settings")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();
  const threshold = settings?.alert_threshold ?? 5.0;

  // 2. Buscar thread
  const { data: messages, error: msgErr } = await sbAdmin
    .from("whatsapp_messages")
    .select("direction, message_text, created_at, instance_id")
    .eq("client_id", client_id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (msgErr) return json({ error: `DB error: ${msgErr.message}` }, 500);
  if (!messages || messages.length === 0) {
    return json({ error: `Nenhuma mensagem para client_id=${client_id}` }, 404);
  }

  const instanceId = (messages[0] as any).instance_id ?? null;

  // Resolve o user_id responsável: body > JWT > instância WhatsApp
  let instanceUserId: string | null = user_id ?? userId ?? null;
  if (instanceId) {
    const { data: inst } = await sbAdmin
      .from("pipeline_whatsapp_instances")
      .select("user_id")
      .eq("id", instanceId)
      .maybeSingle();
    instanceUserId = inst?.user_id ?? instanceUserId;
  }
  const thread = formatThread(messages);

  // 3. Montar prompts
  const systemPrompt = `Você é um analista de qualidade de atendimento da Live Equipamentos, fabricante brasileira de equipamentos de Pilates. Sua função é avaliar conversas de WhatsApp entre um atendente da Live e um cliente/lead.

Avalie a conversa segundo três dimensões, cada uma de 0 a 10:
- score_response_time: velocidade e consistência das respostas do atendente.
- score_tone: educação, clareza e profissionalismo do atendente.
- score_commercial: avanço no funil de vendas e aproveitamento da oportunidade comercial.

Calcule score_overall como a média ponderada com os pesos canônicos: tone 40%, commercial 35%, response_time 25%.

Defina alert_level assim: "critical" se score_overall < ${threshold}; "warning" se score_overall < ${threshold + 2}; "ok" caso contrário.

Escreva summary como um resumo objetivo da conversa em no máximo 2 frases, em português. Escreva recommendations como uma lista de 2 a 3 recomendações práticas e acionáveis para o atendente melhorar, em português.

Responda APENAS com um objeto JSON válido, sem markdown, sem texto antes ou depois, exatamente neste formato:
{
  "score_overall": <número 0-10>,
  "score_response_time": <número 0-10>,
  "score_tone": <número 0-10>,
  "score_commercial": <número 0-10>,
  "alert_level": "<ok|warning|critical>",
  "summary": "<resumo em até 2 frases>",
  "recommendations": ["<rec1>", "<rec2>"]
}`;

  const userPrompt = `CONVERSA:\n${thread}`;

  // 4. Chamar o OpenRouter (síncrono)
  let orRes: Response;
  try {
    orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "LivePosVenda - Analise WA",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });
  } catch (fetchErr) {
    console.error("[analyze-wa] fetch OpenRouter falhou:", fetchErr);
    return json({ error: `OpenRouter inacessível: ${String(fetchErr)}` }, 502);
  }

  if (!orRes.ok) {
    const err = await orRes.text();
    console.error("[analyze-wa] OpenRouter status:", orRes.status, "body:", err);
    return json({ error: `OpenRouter error ${orRes.status}: ${err}` }, 502);
  }

  const orBody = await orRes.json();
  const rawText: string = orBody?.choices?.[0]?.message?.content ?? "";
  const runId: string | null = orBody?.id ?? null;
  console.log("[analyze-wa] OpenRouter raw (200chars):", rawText.slice(0, 200));

  // 5. Parsear e gravar wa_feedbacks
  const parsed = parseAgentOutput(rawText);
  if (!parsed) {
    const { data: errRow } = await sbAdmin.from("wa_feedbacks").insert({
      client_id,
      user_id: instanceUserId,
      instance_id: instanceId,
      status: "error",
      run_id: runId,
      raw_response: rawText,
    }).select("id").single();
    return json({ error: "Resposta da IA não pôde ser interpretada", feedback_id: errRow?.id }, 502);
  }

  const {
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary, recommendations,
  } = parsed;

  const { data: fb } = await sbAdmin.from("wa_feedbacks").insert({
    client_id,
    user_id: instanceUserId,
    instance_id: instanceId,
    score_overall, score_response_time, score_tone, score_commercial,
    alert_level, summary,
    recommendations: JSON.stringify(recommendations ?? []),
    status: "done",
    run_id: runId,
    raw_response: rawText,
  }).select("id").single();

  // 6. Disparar notificações se a conversa for crítica
  if (alert_level === "critical" && instanceUserId) {
    const { data: clientRow } = await sbAdmin
      .from("clients")
      .select("name, phone")
      .eq("id", client_id)
      .maybeSingle();
    const clientName = clientRow?.name ?? clientRow?.phone ?? "cliente";

    const notifBase = {
      type: "wa_feedback_alert",
      title: "⚠️ Conversa crítica detectada",
      body: `A conversa com ${clientName} foi avaliada abaixo do threshold. Nota: ${score_overall}`,
      link: "/minhas-conversas-wa",
    };

    await sbAdmin.from("notifications").insert({ ...notifBase, user_id: instanceUserId });

    const { data: admins } = await sbAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminNotifs = (admins ?? [])
      .filter((a: { user_id: string }) => a.user_id !== instanceUserId)
      .map((a: { user_id: string }) => ({ ...notifBase, user_id: a.user_id, link: "/admin/conversas" }));
    if (adminNotifs.length > 0) {
      await sbAdmin.from("notifications").insert(adminNotifs);
    }
  }

  return json({ ok: true, feedback_id: fb?.id, score_overall, alert_level });
});
```

- [ ] **Step 2: Conferir que não restou nenhuma referência a OpenClaw**

Run: `grep -ni "openclaw\|webhook" supabase/functions/analyze-wa-conversation/index.ts`
Expected: nenhuma linha retornada (saída vazia).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyze-wa-conversation/index.ts
git commit -m "feat(wa-ia): analyze-wa-conversation chama OpenRouter (Claude Sonnet) sincrono"
```

---

## Task 2: Reescrever `suggest-wa-response` para OpenRouter

**Files:**
- Modify (substituir conteúdo inteiro): `supabase/functions/suggest-wa-response/index.ts`

- [ ] **Step 1: Substituir o arquivo inteiro pelo código abaixo**

```ts
// supabase/functions/suggest-wa-response/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;

// Slug do modelo no OpenRouter — confirmar contra https://openrouter.ai/models
const MODEL = "anthropic/claude-haiku-4.5";

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

  if (!OPENROUTER_API_KEY) {
    console.error("[suggest-wa] OPENROUTER_API_KEY não configurado");
    return json({ error: "Configuração incompleta: OPENROUTER_API_KEY ausente" }, 500);
  }

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

  // Instância WhatsApp ativa do usuário
  const { data: instance } = await sbAdmin
    .from("pipeline_whatsapp_instances")
    .select("id")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  // Últimas 10 mensagens do cliente, em ordem cronológica
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

  const systemPrompt = `Você é um copiloto de vendas consultivas da Live Equipamentos, fabricante brasileira de equipamentos de Pilates com inteligência artificial embarcada. Você ajuda um vendedor da Live sugerindo a próxima resposta a ser enviada para um lead no WhatsApp.

Diretrizes:
- Tom consultivo, cordial e profissional, em português do Brasil. Nunca agressivo ou insistente.
- Foque em entender a necessidade do lead, gerar valor e avançar a conversa no funil de vendas.
- Seja objetivo: a sugestão deve ser uma mensagem pronta para enviar, curta o suficiente para WhatsApp.
- Se o lead pedir algo que exige decisão humana (preço final, condição especial de pagamento, prazo de entrega, reclamação) ou demonstrar irritação, sugira que o vendedor assuma a conversa pessoalmente.
- Não invente informações sobre produtos, preços ou prazos que não estejam no histórico.

Responda APENAS com o texto da mensagem sugerida, sem aspas, sem markdown, sem comentários antes ou depois.`;

  const userPrompt = `HISTÓRICO (últimas mensagens):
${historyText}

MENSAGEM DO LEAD:
${inbound_text}`;

  // Chamar o OpenRouter (síncrono)
  let suggestionText = "";
  let runId: string | null = null;
  let callOk = true;
  try {
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-Title": "LivePosVenda - Copiloto WA",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 500,
      }),
    });
    if (!orRes.ok) {
      console.warn("[suggest-wa] OpenRouter status:", orRes.status, await orRes.text());
      callOk = false;
    } else {
      const orBody = await orRes.json();
      suggestionText = (orBody?.choices?.[0]?.message?.content ?? "").trim();
      runId = orBody?.id ?? null;
    }
  } catch (e) {
    console.warn("[suggest-wa] OpenRouter fetch error:", String(e));
    callOk = false;
  }

  const status = callOk && suggestionText ? "done" : "error";

  // Grava o resultado já finalizado — a extensão faz polling e acha pronto no 1º poll
  const { data: suggestion } = await sbAdmin
    .from("wa_suggestions")
    .insert({
      client_id,
      user_id: user.id,
      instance_id: instance?.id ?? null,
      inbound_message: inbound_text,
      suggested_response: suggestionText || null,
      status,
      run_id: runId,
    })
    .select("id")
    .single();

  return json({ ok: status === "done", suggestion_id: suggestion?.id });
});
```

- [ ] **Step 2: Conferir que não restou nenhuma referência a OpenClaw**

Run: `grep -ni "openclaw\|webhook\|sessionKey" supabase/functions/suggest-wa-response/index.ts`
Expected: nenhuma linha retornada (saída vazia).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/suggest-wa-response/index.ts
git commit -m "feat(wa-ia): suggest-wa-response chama OpenRouter (Claude Haiku) sincrono"
```

---

## Task 3: Remover a Edge Function `wa-feedback-webhook`

A função de callback assíncrono não existe mais nesta arquitetura. Sua lógica de parse e de notificação foi absorvida pela `analyze-wa-conversation` na Task 1.

**Files:**
- Delete: `supabase/functions/wa-feedback-webhook/index.ts` (e o diretório `wa-feedback-webhook/`)

- [ ] **Step 1: Apagar o diretório da função**

Run (PowerShell): `Remove-Item -Recurse -Force supabase/functions/wa-feedback-webhook`
Expected: sem saída; o diretório deixa de existir.

- [ ] **Step 2: Confirmar que nenhum outro arquivo referencia o webhook**

Run: `grep -rni "wa-feedback-webhook" supabase/ src/ livecrm-extension/`
Expected: nenhuma linha retornada (saída vazia). Se aparecer alguma referência, ela é resíduo — investigar antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add -A supabase/functions/wa-feedback-webhook
git commit -m "chore(wa-ia): remove wa-feedback-webhook (callback assincrono do OpenClaw)"
```

---

## Task 4: Ajustar textos do frontend

Dois ajustes pequenos de texto. Nenhuma mudança de lógica.

**Files:**
- Modify: `src/pages/SettingsPage.tsx` (campo "Agente IA em uso" no `WaIaSettingsTab`, ~linhas 194-203)
- Modify: `src/components/wa/WaFeedbackPanel.tsx` (toast de sucesso ~linha 110 e label do botão ~linha 211)

- [ ] **Step 1: Atualizar o campo de modelo em `SettingsPage.tsx`**

Localizar este bloco no `WaIaSettingsTab`:

```tsx
      {/* Agent ID */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Agente IA em uso</p>
        <input
          readOnly
          value={settings?.agent_id ?? "agente-feedback-wa"}
          className="w-full border rounded-lg px-3 py-1.5 text-sm bg-muted text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">Identificador do agente responsável pela análise de conversas.</p>
      </div>
```

Substituir por:

```tsx
      {/* Modelos de IA */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Modelos de IA em uso</p>
        <input
          readOnly
          value="Claude Sonnet 4.6 (feedback) · Claude Haiku 4.5 (copiloto) — via OpenRouter"
          className="w-full border rounded-lg px-3 py-1.5 text-sm bg-muted text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">Modelos usados na análise de qualidade das conversas e no copiloto de respostas.</p>
      </div>
```

- [ ] **Step 2: Atualizar o toast de sucesso em `WaFeedbackPanel.tsx`**

Localizar (dentro de `analyze` → `onSuccess`):

```tsx
      toast.success("Análise iniciada — resultado em ~20s");
```

Substituir por:

```tsx
      toast.success("Análise concluída");
```

- [ ] **Step 3: Atualizar o label do botão em `WaFeedbackPanel.tsx`**

Localizar:

```tsx
              {analyze.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Iniciando...</>
```

Substituir a primeira linha do ternário por:

```tsx
              {analyze.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analisando...</>
```

- [ ] **Step 4: Verificar o build**

Run: `npm run build`
Expected: build conclui sem erros de TypeScript nem de compilação.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.tsx src/components/wa/WaFeedbackPanel.tsx
git commit -m "chore(wa-ia): textos do frontend refletem modelos OpenRouter"
```

---

## Task 5: Deploy e verificação manual

Esta task configura os secrets, faz o deploy e valida as duas funções em produção. Executar com o Supabase CLI autenticado e o projeto linkado (ref `ehqkggiuouczmafmlzls`).

**Pré-requisito:** ter em mãos a `OPENROUTER_API_KEY` (o usuário confirmou que já a possui).

- [ ] **Step 1: Configurar o secret do OpenRouter**

Run: `supabase secrets set OPENROUTER_API_KEY=<chave-do-usuario>`
Expected: `Finished supabase secrets set.`

- [ ] **Step 2: Remover os secrets antigos do OpenClaw**

Run: `supabase secrets unset OPENCLAW_URL OPENCLAW_HOOKS_TOKEN OPENCLAW_GATEWAY_TOKEN OPENCLAW_WEBHOOK_SECRET`
Expected: `Finished supabase secrets unset.` (secrets inexistentes são ignorados sem erro).

- [ ] **Step 3: Fazer deploy das duas funções reescritas**

Run:
```bash
supabase functions deploy analyze-wa-conversation
supabase functions deploy suggest-wa-response
```
Expected: `Deployed Functions on project ehqkggiuouczmafmlzls` para cada uma.

- [ ] **Step 4: Remover a função `wa-feedback-webhook` do projeto Supabase**

Run: `supabase functions delete wa-feedback-webhook`
Expected: confirmação de remoção. Se a função já não existir no projeto, ignorar o erro.

- [ ] **Step 5: Verificar `analyze-wa-conversation`**

Pegar um `client_id` real que tenha mensagens em `whatsapp_messages` (consultar no Supabase SQL Editor: `select client_id from whatsapp_messages limit 1;`).

Run (substituir `<ANON_KEY>` e `<CLIENT_ID>`):
```bash
curl -i -X POST "https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/analyze-wa-conversation" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<CLIENT_ID>"}'
```
Expected: HTTP 200 com corpo `{"ok":true,"feedback_id":"...","score_overall":<n>,"alert_level":"<ok|warning|critical>"}`.

Conferir no SQL Editor: `select status, score_overall, summary from wa_feedbacks order by created_at desc limit 1;` → linha com `status = 'done'` e scores coerentes.

- [ ] **Step 6: Verificar `suggest-wa-response`**

Esta função exige JWT de usuário válido. Obter um `access_token` logando no CRM e copiando o token da sessão (DevTools → Application → Local Storage → chave do Supabase), ou via `supabase` SQL/admin.

Run (substituir `<USER_JWT>`, `<ANON_KEY>`, `<CLIENT_ID>`):
```bash
curl -i -X POST "https://ehqkggiuouczmafmlzls.supabase.co/functions/v1/suggest-wa-response" \
  -H "Authorization: Bearer <USER_JWT>" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<CLIENT_ID>","inbound_text":"Bom dia, quanto custa o equipamento?"}'
```
Expected: HTTP 200 com corpo `{"ok":true,"suggestion_id":"..."}`.

Conferir no SQL Editor: `select status, suggested_response from wa_suggestions order by created_at desc limit 1;` → linha com `status = 'done'` e `suggested_response` preenchido.

- [ ] **Step 7: Verificar logs sem erro**

Run:
```bash
supabase functions logs analyze-wa-conversation
supabase functions logs suggest-wa-response
```
Expected: as invocações dos steps 5 e 6 aparecem sem stack traces nem `OPENROUTER_API_KEY ausente`.

- [ ] **Step 8: Verificação final pela UI**

Abrir o CRM, ir numa conversa de WhatsApp, abrir o painel "Análise IA" e clicar em "Analisar agora". Expected: após ~20s aparece a nota e o resumo; o toast diz "Análise concluída".

---

## Resumo dos commits

1. `feat(wa-ia): analyze-wa-conversation chama OpenRouter (Claude Sonnet) sincrono`
2. `feat(wa-ia): suggest-wa-response chama OpenRouter (Claude Haiku) sincrono`
3. `chore(wa-ia): remove wa-feedback-webhook (callback assincrono do OpenClaw)`
4. `chore(wa-ia): textos do frontend refletem modelos OpenRouter`

A Task 5 não gera commits (deploy e verificação). Ao final, fazer merge da branch `feat/openrouter-wa-ia` em `main` conforme o fluxo de `finishing-a-development-branch`.
