# Design Spec — LiveCRM Extension: 4 Novas Features + Orç/PD + IA

**Data:** 2026-05-10  
**Status:** Aprovado  
**Projeto:** LiveCRM WhatsApp Chrome Extension (`livecrm-extension/`)

---

## Contexto

A extensão LiveCRM injeta um sidebar no WhatsApp Web para vincular conversas ao CRM LivePosVenda. Este spec descreve 5 novas funcionalidades aprovadas em sessão de brainstorming com mockups visuais.

---

## Escopo

1. Etiquetas Visuais (Labels)
2. Respostas Rápidas + Sugestões IA
3. Lembrete de Follow-up
4. Mensagens Agendadas
5. Orçamento / PD no Sidebar

---

## Layout do Sidebar

**Decisão:** Opção C — etiqueta inline ao lado do nome + grade 2×2 de ações

```
┌─ Header (dark #111827 + logo) ─────────────────┐
│ [Nome do Contato]   [🏷 badge etiqueta]        │
│ 55 11 99999-9999                               │
├────────────────────────────────────────────────┤
│ FUNIL / ETAPA                                  │
│ [select etapa]                                 │
│ [↗ Abrir no CRM]                              │
├────────────────────────────────────────────────┤
│ ORÇAMENTO / PD  (se existir)                   │
│ 📋 [Nome orçamento]  R$ valor  [status]        │
│ 📄 [Nome PD]         R$ valor  [status]        │
│ (se não existir: "Sem orçamento ou PD  + Criar")│
├────────────────────────────────────────────────┤
│ [📨 Resposta]  [⏰ Follow-up]                 │
│ [📅 Agendar]   [🏷 Etiqueta]                 │
│  ↕ painel expansível conforme botão ativo      │
├────────────────────────────────────────────────┤
│ NOTAS (existente, colapsável)                  │
└────────────────────────────────────────────────┘
```

Cada botão da grade expande seu painel inline abaixo da grade. Somente um painel aberto por vez. O botão ativo fica laranja (#f97316).

---

## Feature 1 — Etiquetas Visuais

### Modelo de etiquetas
**Decisão:** Opção C — 4 presets fixos + criar novas personalizadas

**Presets fixos:**
| Emoji | Nome | Background | Cor texto |
|-------|------|-----------|-----------|
| 🔴 | Urgente | #fee2e2 | #991b1b |
| 🟡 | Follow-up | #fef3c7 | #92400e |
| 🟢 | Fechado | #d1fae5 | #065f46 |
| 🔵 | VIP | #dbeafe | #1e40af |

**Personalizadas:** criadas pelo usuário com nome livre + seletor de 6 cores predefinidas.

### Armazenamento
```
chrome.storage.local:
  label_<phone>: { id, name, color, bg }           // etiqueta ativa do contato
  custom_labels: [{ id, name, color, bg }]          // lista de labels criadas pelo usuário
```

### Visual
- **Badge inline** ao lado do nome no header do sidebar (ex: `João Silva  🟡 Follow-up`)
- **Ponto colorido** injetado na lista de conversas do WA Web via `injectLabelBadges()` — DOM mutation observer para novos itens

### Mensagens background
- `GET_CONTACT_LABEL` → retorna label ativa do phone
- `SET_CONTACT_LABEL` → salva/remove label do contato
- `GET_CUSTOM_LABELS` → lista de labels personalizadas
- `SAVE_CUSTOM_LABEL` → cria nova label personalizada
- `DELETE_CUSTOM_LABEL` → remove label personalizada

### Painel no sidebar
```
ETIQUETA
  PADRÕES
  [🔴 Urgente] [🟡 Follow-up] [🟢 Fechado] [🔵 VIP]
  
  PERSONALIZADAS
  [💕 Cliente Antigo]  [+ Nova]
  
  ✓ Follow-up selecionado    ✕ remover
```
Label ativa tem borda laranja (#f97316). "✕ remover" limpa a seleção.

---

## Feature 2 — Respostas Rápidas + Sugestões IA

### Painel "📨 Resposta"
Dividido em duas seções:

**Seção superior — Sugestões da IA:**
- Chama endpoint do Supabase Edge Function `generate-reply-suggestions` passando o contexto da conversa (últimas mensagens, nome do contato, orçamento ativo se houver)
- Exibe 2–3 sugestões em cards roxos (#faf5ff / #e9d5ff)
- Cada card tem botão **"Usar ↗"** que injeta o texto no campo de input do WA Web via `document.execCommand('insertText')` + `input` event dispatch
- Botão "↻ Gerar novas" regenera sugestões

**Seção inferior — Respostas Salvas:**
- Templates manuais gerenciados pelo usuário
- Click no template também injeta via `document.execCommand`

### Armazenamento
```
chrome.storage.local:
  quick_replies: [{ id, title, body }]
```

### Mensagens background
- `GET_QUICK_REPLIES`
- `SAVE_QUICK_REPLY`
- `DELETE_QUICK_REPLY`
- `GENERATE_AI_SUGGESTIONS` → chama Edge Function, retorna array de strings

### Injeção no campo WA
```javascript
function injectTextIntoWAInput(text) {
  const input = document.querySelector('[data-tab="10"] [contenteditable]')
             || document.querySelector('footer [contenteditable]');
  if (!input) return;
  input.focus();
  document.execCommand('insertText', false, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
```

---

## Feature 3 — Lembrete de Follow-up

### UX
- Picker rápido: **Em 1h / Hoje / Amanhã / Próx. semana** (botões toggle)
- Campo de hora (`<input type="time">`)
- Campo de nota opcional
- Botão "⏰ Definir lembrete"
- Lembrete ativo exibido no topo do painel com botão ✕ para cancelar

### Armazenamento
```
chrome.storage.local:
  followups: [{ id, phone, contactName, dueAt (ISO), note }]
```

### Agendamento
```javascript
chrome.alarms.create('followup_' + id, { when: Date.parse(dueAt) });
```
Handler `chrome.alarms.onAlarm` verifica prefixo `followup_`, busca o lembrete no storage, dispara `chrome.notifications.create`.

### Notificação
```javascript
chrome.notifications.create({
  type: 'basic',
  iconUrl: 'icon128.png',
  title: '⏰ Follow-up: ' + contactName,
  message: note || 'Hora de retornar a conversa!',
  buttons: [{ title: 'Abrir WhatsApp' }]
});
```

### Manifest
Adicionar `"notifications"` ao array `permissions`.

### Mensagens background
- `SET_FOLLOWUP_REMINDER` → salva + cria alarm
- `GET_FOLLOWUP_REMINDERS` → lista por phone
- `DELETE_FOLLOWUP_REMINDER` → remove alarm + storage entry

---

## Feature 4 — Mensagens Agendadas

### Banco de dados
Nova coluna na tabela existente:
```sql
ALTER TABLE whatsapp_pending_sends
  ADD COLUMN scheduled_at TIMESTAMPTZ DEFAULT NULL;
```
`NULL` = envio imediato (comportamento atual preservado).

### Query modificada
`processPendingSends` adiciona filtro:
```javascript
.or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
```
Somente despacha mensagens sem agendamento ou com `scheduled_at ≤ now()`.

### UX
- Textarea para a mensagem
- `<input type="datetime-local">` para data/hora
- Botão "📅 Agendar envio"
- Lista de mensagens agendadas abaixo: texto truncado + data/hora + botão ✕ cancelar

### Mensagens background
- `SCHEDULE_MESSAGE` → insere na tabela com `scheduled_at`, `status = 'pending'`
- `GET_SCHEDULED_MESSAGES` → lista por phone/instance onde `scheduled_at > now()` e `status = 'pending'`
- `CANCEL_SCHEDULED_MESSAGE` → atualiza `status = 'cancelled'`

---

## Feature 5 — Orçamento / PD no Sidebar

### Posição
Entre a seção Funil/Etapa e a grade de ações 2×2.

### Dados
Consulta via Supabase (`sb` autenticado) quando o sidebar abre:
- Orçamentos: tabela `quotes` filtrada por `client_id` (ou por `phone` via `clients.wa_jid`)
- PDs: tabela `proposals` (ou equivalente) filtrada da mesma forma

### Estados
| Estado | Exibição |
|--------|---------|
| Sem nenhum | `"Sem orçamento ou PD"` + botão `+ Criar` |
| 1 orçamento | Card laranja com nome, valor, status |
| 1 PD | Card azul com nome, valor, status |
| Orçamento + PD | Dois cards empilhados |

### Card
```
[ícone 📋/📄]  ORÇAMENTO / PD — PROPOSTA
               Nome do documento
               R$ valor    [status badge]         ›
```
Click no card: `chrome.tabs.create({ url: CRM_URL + '/orcamentos/' + id })`.

### Status badges
| Status | Background | Texto |
|--------|-----------|-------|
| Em Análise | #fef3c7 | #92400e |
| Aprovado | #d1fae5 | #065f46 |
| Em andamento | #ede9fe | #5b21b6 |
| Recusado | #fee2e2 | #991b1b |

---

## Arquitetura Técnica

### Manifest additions
```json
{
  "permissions": ["storage", "alarms", "scripting", "tabs", "windows", "notifications"]
}
```

### Novos message handlers em background.js
```
GET_CONTACT_LABEL / SET_CONTACT_LABEL
GET_CUSTOM_LABELS / SAVE_CUSTOM_LABEL / DELETE_CUSTOM_LABEL
GET_QUICK_REPLIES / SAVE_QUICK_REPLY / DELETE_QUICK_REPLY
GENERATE_AI_SUGGESTIONS
SET_FOLLOWUP_REMINDER / GET_FOLLOWUP_REMINDERS / DELETE_FOLLOWUP_REMINDER
SCHEDULE_MESSAGE / GET_SCHEDULED_MESSAGES / CANCEL_SCHEDULED_MESSAGE
GET_ORC_PD
```

### Nova Edge Function Supabase
`generate-reply-suggestions`: recebe `{ contactName, recentMessages, orcamento? }`, retorna `{ suggestions: string[] }`. Chama Claude API (`claude-haiku-4-5`) para gerar 2–3 sugestões contextuais.

### Modificações em content_script.js
- `injectLabelBadges()` — MutationObserver na lista de conversas
- `injectTextIntoWAInput(text)` — injeta texto no campo WA
- Seção sidebar expandida com todos os novos painéis

---

## Ordem de Implementação Sugerida

1. **Schema** — migration `scheduled_at` + testar query
2. **Background** — todos os novos message handlers
3. **Manifest** — adicionar `notifications`
4. **Sidebar UI** — layout C com orç/PD + grade 2×2 + painéis
5. **Feature: Etiquetas** — painel + badges WA
6. **Feature: Respostas Rápidas** — painel + injeção
7. **Feature: Follow-up** — painel + alarms + notifications
8. **Feature: Agendar** — painel + lista
9. **Edge Function IA** — sugestões contextuais
10. **Polish** — testes, edge cases, reload automático

---

## Decisões Registradas

| Decisão | Escolha | Alternativas descartadas |
|---------|---------|--------------------------|
| Layout sidebar | C — inline badge + grade 2×2 | A (contextual no topo), B (barra compacta) |
| Modelo de etiquetas | C — 4 presets + criar novas | A (só fixas), B (totalmente livre) |
| Posição sugestões IA | C — dentro do painel Respostas | A (banner automático), B (botão no grid) |
| Storage etiquetas | chrome.storage.local | Supabase DB |
| Storage respostas | chrome.storage.local | Supabase DB |
| Scheduled messages | whatsapp_pending_sends.scheduled_at | Nova tabela |
