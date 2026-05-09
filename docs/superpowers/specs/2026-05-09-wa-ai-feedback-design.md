# Spec: Sistema de Feedback IA — Conversas WhatsApp

**Data:** 2026-05-09  
**Status:** Aprovado para implementação

---

## Visão Geral

Sistema que analisa conversas de WhatsApp usando o agente `agente-feedback-wa` (Claude Haiku 4.5, hospedado no OpenClaw na VPS), gera feedback estruturado por dimensão de qualidade, e entrega esse feedback ao usuário responsável e ao admin. Conversas com nota crítica disparam alerta automático.

---

## Fluxo Completo

```
[Trigger: manual | pg_cron | futuro: limiar de horas sem resposta]
        ↓
Edge Function: analyze-wa-conversation
  - Busca thread completo de whatsapp_messages por client_id
  - Formata conversa em texto estruturado
  - POST openclaw.liveuni.com.br/hooks/agent
      { message, agentId: "agente-feedback-wa", deliver: "webhook",
        to: <SUPABASE_URL>/functions/v1/wa-feedback-webhook,
        thinking: "low", timeoutSeconds: 120, name: "feedback-wa-<client_id>-<ts>" }
  - Insere wa_feedbacks com status: "pending" + run_id recebido (202)
        ↓
[OpenClaw processa assincronamente — Claude Haiku 4.5]
        ↓
Edge Function: wa-feedback-webhook  ← OpenClaw chama aqui
  - Extrai run_id + texto de resposta do agente
  - Parser defensivo: raw.match(/\{[\s\S]*\}/) antes de JSON.parse
  - Atualiza wa_feedbacks: scores + raw_response + status: "done"
  - Se alert_level = "critical" → insere em notifications (usuário + todos admins)
```

---

## Banco de Dados

### Tabela `wa_feedbacks`

```sql
create table wa_feedbacks (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references clients(id) on delete cascade,
  user_id             uuid references auth.users(id),       -- dono da instância
  instance_id         uuid references pipeline_whatsapp_instances(id),
  score_overall       numeric(4,2),                          -- 0.00 – 10.00
  score_response_time numeric(4,2),
  score_tone          numeric(4,2),
  score_commercial    numeric(4,2),
  summary             text,
  recommendations     jsonb default '[]',                    -- string[]
  alert_level         text check (alert_level in ('ok','warning','critical')),
  status              text default 'pending'
                        check (status in ('pending','done','error')),
  run_id              text,                                   -- runId do OpenClaw
  raw_response        text,                                   -- resposta bruta para debug
  created_at          timestamptz default now()
);

-- RLS: usuário vê só os próprios; admin vê todos
alter table wa_feedbacks enable row level security;
create policy "user_own" on wa_feedbacks for select
  using (user_id = auth.uid());
create policy "admin_all" on wa_feedbacks for select
  using (exists (
    select 1 from user_roles
    where user_id = auth.uid() and role in ('admin','master_admin')
  ));
-- INSERT e UPDATE feitos via service_role key nas Edge Functions → RLS bypassado automaticamente
```

### Tabela `wa_analysis_settings`

```sql
create table wa_analysis_settings (
  id               uuid primary key default gen_random_uuid(),
  trigger_type     text default 'manual'
                     check (trigger_type in ('manual','scheduled')),
  schedule_cron    text default '0 22 * * *',  -- 22h todo dia
  alert_threshold  numeric(4,2) default 5.0,   -- score abaixo → critical
  agent_id         text default 'agente-feedback-wa',
  updated_at       timestamptz default now()
);

-- Seed com configuração padrão
insert into wa_analysis_settings (id)
  values ('00000000-0000-0000-0000-000000000001')
  on conflict do nothing;
```

### Tabela `notifications`

```sql
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text,                        -- ex: "wa_feedback_alert"
  title       text,
  body        text,
  link        text,                        -- rota interna para navegar ao clicar
  read        boolean default false,
  created_at  timestamptz default now()
);

alter table notifications enable row level security;
create policy "own" on notifications for all using (user_id = auth.uid());
-- INSERT feito via service_role key nas Edge Functions → RLS bypassado automaticamente
```

---

## Prompt enviado ao agente

```
Você é um analista de qualidade de atendimento. Analise a conversa de WhatsApp abaixo entre um atendente e um cliente.

Retorne APENAS um objeto JSON válido, sem markdown, sem texto antes ou depois:
{
  "score_overall": <0-10>,
  "score_response_time": <0-10>,
  "score_tone": <0-10>,
  "score_commercial": <0-10>,
  "alert_level": "<ok|warning|critical>",
  "summary": "<resumo em 2 frases>",
  "recommendations": ["<rec1>", "<rec2>"]
}

Critérios:
- score_response_time: velocidade e consistência das respostas
- score_tone: educação, clareza e profissionalismo
- score_commercial: avanço no funil, aproveitamento de oportunidade
- score_overall: média ponderada (tone 40%, commercial 35%, response_time 25%)
- alert_level: "critical" se score_overall < threshold configurado (padrão 5.0)

CONVERSA:
[ATENDENTE: <nome>]
<mensagens formatadas: "HH:mm [entrada/saída] texto">
```

---

## Edge Functions

### `analyze-wa-conversation`

**Trigger:** chamada HTTP autenticada (manual ou por pg_cron via `net.http_post`)  
**Input:** `{ client_id: string, user_id?: string }`  
**Lógica:**
1. Busca settings de `wa_analysis_settings` (threshold, agent_id)
2. Busca thread de `whatsapp_messages` onde `client_id = ?`, ordena por `created_at asc`
3. Formata conversa em texto (ver prompt acima)
4. Chama `POST https://openclaw.liveuni.com.br/hooks/agent`
5. Insere `wa_feedbacks` com `status: "pending"`, `run_id`, `client_id`, `user_id`
6. Retorna `{ ok: true, run_id }`

**Env vars necessárias:** `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_URL`

### `wa-feedback-webhook`

**Trigger:** chamada do OpenClaw após processar o agente  
**Sem autenticação de usuário** — valida token secreto por header (`X-Openclaw-Secret`)  
**Lógica:**
1. Extrai `run_id` e texto de resposta do body
2. Parser defensivo:
   ```ts
   const raw = body.output || body.text || body.message || '';
   const match = raw.match(/\{[\s\S]*\}/);
   if (!match) → update status "error", salva raw_response, return
   const data = JSON.parse(match[0]);
   ```
3. Atualiza `wa_feedbacks` onde `run_id = ?`
4. Se `alert_level = "critical"`:
   - Busca `user_id` do feedback
   - Insere notification para o usuário
   - Busca todos admins (user_roles onde role in admin/master_admin)
   - Insere notification para cada admin
5. Retorna `{ ok: true }`

---

## UI

### MinhasConversasWAPage — painel de feedback

Abaixo do thread da conversa selecionada, card colapsável "Análise IA":
- Nota geral (badge colorido: verde ≥7, amarelo 5–6.9, vermelho <5)
- Barras de progresso por dimensão (tempo de resposta, tom, comercial)
- Resumo em texto
- Lista de recomendações
- Botão "Analisar agora" (dispara manual, visível se não houver feedback nas últimas 24h)

### Página `MeuDesempenhoWAPage` — `/meu-desempenho-wa`

- Gráfico de linha: evolução do score_overall nos últimos 30 dias
- Cards de média por dimensão (período selecionável: 7d / 30d / 90d)
- Tabela de feedbacks anteriores com nota + resumo + link para conversa

### AdminConversasPage — painel de feedback

Mesmo card de análise do MinhasConversasWAPage, com botão "Analisar agora" para admin forçar análise de qualquer conversa.

### Página `AdminDesempenhoWAPage` — `/admin/desempenho-wa`

- Tabela: usuário × score médio × qtd conversas analisadas × qtd alertas
- Filtro por período
- Click em usuário expande feedbacks individuais

### Configurações — aba "WhatsApp IA"

Em `/configuracoes`, nova aba:
- Toggle: Análise manual / Agendada
- Se agendada: campo de horário (HH:mm, converte para cron)
- Slider: threshold de alerta crítico (0–10, default 5.0)
- Campo somente-leitura: Agent ID em uso

### Notificações in-app

- Ícone de sino no header com badge de contagem de não lidas
- Dropdown ao clicar: lista de notificações com link de navegação
- Click marca como lida + navega para a conversa
- Hook `useNotifications` com polling a cada 60s (ou Supabase Realtime)

---

## Sidebar — novos itens

```
operationsNav:
  { title: "Meu Desempenho WA", url: "/meu-desempenho-wa", moduleKey: "meu_desempenho_wa" }

adminNav:
  { title: "Desempenho WA", url: "/admin/desempenho-wa", moduleKey: null }
```

---

## Migrations

```
20260509000030_wa_feedbacks.sql
20260509000031_wa_analysis_settings.sql
20260509000032_notifications.sql
```

---

---

## Feature 2 — Sugestões de Resposta no Sidebar da Extensão

### Visão Geral

Quando um lead envia uma mensagem no WA Web, a extensão dispara automaticamente uma chamada ao agente `agente-feedback-wa` solicitando uma sugestão de resposta. A sugestão aparece no sidebar em ~10–20s e o usuário copia com um clique.

### Fluxo

```
mensagem inbound chega no WA Web
        ↓
wa_hook.js captura (LIVECRM_INBOUND) → content_script → background.js
        ↓
background.js chama Edge Function: suggest-wa-response
  { phone, inbound_text, client_id, últimas 10 msgs como contexto }
        ↓
Edge Function insere wa_suggestions (status: "pending") + run_id
        ↓
POST openclaw.liveuni.com.br/hooks/agent
  { agentId: "agente-feedback-wa", message: "<prompt>",
    deliver: "webhook", to: wa-suggestion-webhook, thinking: "low" }
        ↓ (~10–20s — OpenClaw processa)
wa-suggestion-webhook recebe → atualiza wa_suggestions (status: "done")
        ↓
Sidebar faz polling a cada 5s → exibe sugestão + botão Copiar
```

### Tabela `wa_suggestions`

```sql
create table wa_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid references clients(id) on delete cascade,
  user_id            uuid references auth.users(id),
  instance_id        uuid references pipeline_whatsapp_instances(id),
  inbound_message    text,
  suggested_response text,
  status             text default 'pending'
                       check (status in ('pending','done','error')),
  run_id             text,
  created_at         timestamptz default now()
);

alter table wa_suggestions enable row level security;
create policy "user_own" on wa_suggestions for select
  using (user_id = auth.uid());
-- INSERT/UPDATE via service_role → RLS bypassado
```

### Prompt enviado ao agente

```
Você é um assistente de vendas e atendimento da Live Equipamentos.
Analise a conversa abaixo e sugira UMA resposta para a última mensagem
recebida do lead/cliente. Seja direto, profissional e natural.
Retorne APENAS o texto da resposta, sem explicações, sem aspas, sem prefixos.

HISTÓRICO DA CONVERSA:
<últimas 10 mensagens: "HH:mm [entrada|saída] texto">

ÚLTIMA MENSAGEM DO LEAD:
<texto da mensagem inbound>
```

### Edge Functions

**`suggest-wa-response`**
- Auth: token do usuário (chamada pelo background.js via fetch com JWT)
- Input: `{ phone, inbound_text, client_id }`
- Busca últimas 10 mensagens do cliente em `whatsapp_messages`
- Monta prompt, chama openclaw, insere `wa_suggestions` com run_id
- Retorna `{ ok: true, suggestion_id }`

**`wa-suggestion-webhook`**
- Sem auth de usuário — valida `X-Openclaw-Secret`
- Extrai run_id + texto de resposta
- Atualiza `wa_suggestions` onde `run_id = ?`, status: "done"
- Sem alertas — feature de sugestão não gera notificações

### UI — Sidebar da Extensão

Nova seção abaixo das informações do contato:

```
┌─────────────────────────────────────┐
│ 💬 Sugestão de resposta             │
│ ─────────────────────────────────── │
│ ⟳ Gerando sugestão...              │  ← status: pending (spinner)
├─────────────────────────────────────┤
│ "Olá! Podemos agendar uma visita    │  ← status: done
│  técnica para sexta. Qual horário   │
│  fica melhor para você?"            │
│                      [📋 Copiar]   │
└─────────────────────────────────────┘
```

- Aparece apenas quando há conversa ativa detectada pelo sidebar
- Nova mensagem inbound substitui sugestão anterior
- Não dispara para mensagens outbound
- Polling a cada 5s enquanto status = "pending"
- Botão "Copiar" usa `navigator.clipboard.writeText()`
- Timeout visual após 60s sem resposta (exibe "Não foi possível gerar sugestão")

### Migration adicional

```
20260509000033_wa_suggestions.sql
```

---

## Restrições e decisões

- OpenClaw é **async puro** — não há modo síncrono no `/hooks/agent`
- Agente dedicado `agente-feedback-wa` (Claude Haiku 4.5) — não usar `consultor-virtual-live`
- Parser defensivo obrigatório — LLMs podem retornar JSON envolto em markdown
- `raw_response` salvo sempre — facilita debug sem reprocessar
- RLS: usuário vê só os próprios feedbacks; admin vê todos via policy separada
- Threshold de alerta configurável — padrão 5.0 (escala 0–10)
- Feedback de alerta notifica usuário + **todos** os admins simultaneamente
- Agente `agente-feedback-wa` serve as duas features (feedback + sugestão) com prompts distintos
- Sugestões não geram alertas — são auxiliares ao usuário, não métricas de qualidade
- Polling de 5s no sidebar é suficiente dado latência esperada de 10–20s do agente
- Timeout de 60s no sidebar para sugestão sem resposta — evita spinner eterno
