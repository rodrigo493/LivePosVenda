# Design — Migração da IA de WhatsApp: OpenClaw → OpenRouter (Claude)

**Data:** 2026-05-18
**Status:** Aprovado
**Substitui a arquitetura de:** `docs/superpowers/specs/2026-05-09-wa-ai-feedback-design.md`

## Visão Geral

A feature de IA de conversas WhatsApp (Feature 1 — feedback de qualidade; Feature 2 — copiloto de sugestões em tempo real) hoje depende do **OpenClaw**, uma plataforma de agentes self-hosted na VPS (`openclaw.liveuni.com.br`), operada de forma **assíncrona**: a Edge Function dispara um run, o OpenClaw processa, e devolve o resultado num callback de webhook.

Esta migração substitui o OpenClaw pelo **OpenRouter** chamando o **Claude** diretamente. O OpenRouter expõe uma API HTTP **síncrona**: a Edge Function chama, espera a resposta do modelo e grava o resultado na mesma requisição. Com isso a feature deixa de precisar do callback assíncrono — passa de **3 Edge Functions para 2**.

A feature em si (páginas, tabelas, extensão) é preservada. Só o backend de IA muda.

## Decisões

| Tema | Decisão |
|------|---------|
| Modelo do feedback de qualidade | `anthropic/claude-sonnet-4.6` (sem pressa, análise mais profunda) |
| Modelo do copiloto em tempo real | `anthropic/claude-haiku-4.5` (latência alvo 5–15s) |
| System prompts | Embutidos nas Edge Functions, escritos a partir da spec de 2026-05-09 |
| Fluxo da extensão Chrome | Mantido — a função grava `wa_suggestions` com `status: 'done'` antes de retornar; o `background.js` continua o polling atual e acha o resultado pronto. Zero mudança na extensão. |
| Tabelas do banco | Mantidas (`wa_feedbacks`, `wa_suggestions`, `wa_analysis_settings`) e suas migrations |

## API do OpenRouter

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Headers: `Authorization: Bearer ${OPENROUTER_API_KEY}`, `Content-Type: application/json`
- Corpo: `{ model, messages: [{ role: "system"|"user", content }], temperature, max_tokens }`
- Resposta: texto do modelo em `choices[0].message.content`; id do run em `id`
- Os slugs de modelo (`anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5`) ficam como constantes no topo de cada função e devem ser confirmados contra a lista de modelos do OpenRouter na implementação.

## Componentes

### `analyze-wa-conversation` (reescrita)

Dispara a análise de qualidade de uma conversa.

- **Auth:** opcional (JWT do browser quando presente); usa `service_role` para todas as operações de banco.
- **Input:** `{ client_id, user_id? }`
- **Fluxo:**
  1. Busca `wa_analysis_settings` (threshold de alerta).
  2. Busca a thread em `whatsapp_messages` por `client_id` (até 100 msgs, ordem cronológica) e formata em texto.
  3. Resolve o `user_id` responsável (do body, do JWT ou da instância WhatsApp).
  4. Chama o OpenRouter com modelo `anthropic/claude-sonnet-4.6`:
     - `system`: prompt de analista de qualidade — exige objeto JSON com `score_overall`, `score_response_time`, `score_tone`, `score_commercial`, `alert_level`, `summary`, `recommendations`. Pesos canônicos: tone 40%, commercial 35%, response_time 25%. `alert_level`: `critical` se `score_overall < threshold`, `warning` se `< threshold + 2`, senão `ok`.
     - `user`: a conversa formatada.
  5. Faz parse defensivo do JSON (regex `\{[\s\S]*\}` antes de `JSON.parse`).
  6. **INSERT direto** em `wa_feedbacks`:
     - Sucesso: `status: 'done'` + todos os scores + `summary` + `recommendations` (JSON) + `raw_response`.
     - Parse falhou: `status: 'error'` + `raw_response`.
  7. Se `alert_level === 'critical'` e houver `user_id`: insere notificações `wa_feedback_alert` para o responsável e para todos os admins (lógica migrada do antigo `wa-feedback-webhook`).
- **Output:** `{ ok: true, feedback_id, score_overall, alert_level }` ou `{ error }` com status 4xx/5xx.
- **Erros:** falha de rede ou status não-OK do OpenRouter → resposta 502.

### `suggest-wa-response` (reescrita)

Gera uma sugestão de resposta para o vendedor, em tempo real.

- **Auth:** obrigatória — JWT do usuário; rejeita 401 se ausente.
- **Input:** `{ client_id, inbound_text }`
- **Fluxo:**
  1. Busca a instância WhatsApp ativa do usuário.
  2. Busca as últimas 10 mensagens do cliente em `whatsapp_messages` e formata em texto cronológico.
  3. Chama o OpenRouter com modelo `anthropic/claude-haiku-4.5`:
     - `system`: prompt do copiloto de vendas consultivas Live — define tom consultivo, produtos Live e lógica de handoff para humano.
     - `user`: histórico das últimas mensagens + mensagem do lead.
  4. **INSERT direto** em `wa_suggestions`:
     - Sucesso: `status: 'done'` + `suggested_response` + `inbound_message`.
     - Resposta vazia ou falha na chamada: `status: 'error'`.
  5. Retorna o `suggestion_id`.
- **Output:** `{ ok: true, suggestion_id }` ou `{ error }`.
- **Consumo pela extensão:** o `background.js` recebe o `suggestion_id` e faz polling em `wa_suggestions`; como a linha já está `done`/`error`, o resultado aparece no 1º poll. Sem mudança no código da extensão.

### `wa-feedback-webhook` — removida

Apagada por completo (`supabase/functions/wa-feedback-webhook/`). Não existe mais callback assíncrono. A lógica de parse e de notificação `critical` foi absorvida pela `analyze-wa-conversation`.

### `src/pages/SettingsPage.tsx` — ajuste

No `WaIaSettingsTab`, o campo read-only "Agente IA em uso" (mostrava `agente-feedback-wa`, conceito OpenClaw) passa a ser informativo, indicando os modelos em uso: "Claude Sonnet 4.6 (feedback) / Haiku 4.5 (copiloto) — via OpenRouter". Os controles de `trigger_type`, horário de agendamento e `alert_threshold` permanecem inalterados.

### `src/components/wa/WaFeedbackPanel.tsx` — revisão

Revisar na implementação. Como a `analyze-wa-conversation` agora é síncrona, ao resolver a chamada a linha em `wa_feedbacks` já está `done`; o `invalidateQueries` atual do painel exibe o resultado. Esperado: sem mudança de lógica. Se o painel tiver polling para estado `pending`, esse caminho fica inerte (inofensivo).

## Secrets (Supabase)

- **Remover:** `OPENCLAW_URL`, `OPENCLAW_HOOKS_TOKEN`, `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_WEBHOOK_SECRET`
- **Adicionar:** `OPENROUTER_API_KEY`

## Fora de escopo (não muda)

- Tabelas `wa_feedbacks`, `wa_suggestions`, `wa_analysis_settings` e suas migrations.
- Páginas `MeuDesempenhoWAPage`, `AdminDesempenhoWAPage`, rotas no `App.tsx`, itens do sidebar, `crmModules.ts`.
- `livecrm-extension/background.js` e demais arquivos da extensão.
- Eventual pg_cron de análise agendada continua chamando `analyze-wa-conversation` sem alteração.

## Verificação

- Teste manual de `analyze-wa-conversation` via `curl` com um `client_id` real → conferir linha `done` em `wa_feedbacks` com scores coerentes.
- Teste manual de `suggest-wa-response` com JWT válido → conferir linha `done` em `wa_suggestions` com `suggested_response` preenchido.
- Disparar uma conversa de nota baixa → conferir notificação `wa_feedback_alert` para responsável e admins.
- Build do frontend (`npm run build`) sem erros após o ajuste no `SettingsPage`.
