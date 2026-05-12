# Spec: Automação "Criar Cópia do Card" no CRM

**Data:** 2026-05-11
**Projeto:** LivePosVenda — Motor de Automações CRM
**Status:** Aprovado para implementação

---

## Contexto

O CRM já possui um motor de automações funcional:
- `trigger-automations`: dispara ao mover card para uma etapa
- `execute-automations`: processa a fila via pg_cron a cada minuto
- `action_type` existentes: `whatsapp_message`, `create_task`, `notify_user`

Esta spec adiciona o `action_type` **`create_copy`**, que cria um card idêntico ao original em um funil/etapa configurável.

---

## Objetivo

Quando um card entra em uma etapa com a automação "Criar Cópia" configurada, o sistema cria automaticamente um novo ticket idêntico (incluindo comentários) no funil e etapa definidos pelo administrador.

---

## Arquitetura

Sem novas tabelas. Extensão pura do sistema existente.

```
card entra na etapa
    ↓
trigger-automations (sem mudança)
    ↓ insere em pipeline_automation_queue
pg_cron → execute-automations
    ↓ switch(action_type)
       case 'create_copy' → NOVO
           ├── carrega ticket original + comments
           ├── resolve stage key do target_stage_id
           ├── INSERT novo ticket (campos copiados)
           └── INSERT ticket_comments (um a um)
```

**action_config do `create_copy`:**
```json
{
  "target_pipeline_id": "uuid-do-funil-destino",
  "target_stage_id": "uuid-da-etapa-destino"
}
```

---

## Campos Copiados

### Ticket

| Campo | Comportamento |
|---|---|
| `title` | Copia do original |
| `client_id` | Copia do original |
| `assigned_to` | Copia do original |
| `description` | Copia do original |
| `internal_notes` | Copia do original |
| `channel` | Copia do original |
| `priority` | Copia do original |
| `problem_category` | Copia do original |
| `ticket_type` | Copia do original |
| `equipment_id` | Copia do original |
| `estimated_value` | Copia do original |
| `pipeline_id` | `target_pipeline_id` da config |
| `pipeline_stage` | key resolvida de `target_stage_id` |
| `status` | Sempre `'aberto'` |
| `origin` | Sempre `'copy'` |
| `ticket_number` | `""` (padrão do sistema) |

### Campos NÃO copiados

`id`, `created_at`, `updated_at`, `closed_at`, `resolved_at`, `deleted_at`, `rd_deal_id`, `ai_triage`, `is_paused`, `last_interaction_at`, `pipeline_position`

### ticket_comments

Todos os comentários do ticket original são copiados para o novo ticket:
- `ticket_id` → novo ticket id
- `content`, `author_id`, `created_at` → copiados
- `rd_activity_id` → não copiado (restrição UNIQUE)

---

## Comportamentos

- **Loops:** a cópia **não** dispara as automações da etapa destino (para evitar loops infinitos)
- **Falha parcial:** se a cópia do ticket foi criada mas um comment falhou, a entrada da fila é marcada como `done` (o ticket principal foi criado com sucesso)
- **Etapa inválida:** se `target_stage_id` não existir ou não pertencer ao `target_pipeline_id`, a entrada é marcada como `failed` com mensagem de erro descritiva

---

## Arquivos Modificados

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/functions/execute-automations/index.ts` | Modificar | Novo case `create_copy` com lógica de clone |
| `src/hooks/useStageAutomations.ts` | Modificar | Adicionar `'create_copy'` ao type `AutomationActionType` |
| `src/components/crm/AutomationRow.tsx` | Modificar | Nova seção UI com seletores de funil e etapa |

---

## UI — AutomationRow

Quando `action_type === 'create_copy'`, exibir:

```
┌─────────────────────────────────────────────────────┐
│  📋 Criar Cópia do Card                             │
│                                                     │
│  Funil destino:                                     │
│  [ Selecionar funil ▼                         ]     │
│                                                     │
│  Etapa destino:                                     │
│  [ Selecionar etapa ▼                         ]     │
│  (desabilitado até funil ser selecionado)           │
└─────────────────────────────────────────────────────┘
```

- Seletores carregam dados via query Supabase inline no componente
- Etapas são filtradas pelo funil selecionado
- `action_config` é atualizado com `target_pipeline_id` e `target_stage_id` a cada seleção

---

## ACTION_OPTIONS — Nomes Amigáveis

Atualizar o array `ACTION_OPTIONS` em `AutomationRow.tsx` para incluir o novo tipo:

```typescript
{ value: 'whatsapp_message', label: '📱 Enviar WhatsApp' }
{ value: 'create_task',      label: '✅ Criar Tarefa Squad' }
{ value: 'notify_user',      label: '🔔 Notificar Usuário' }
{ value: 'create_copy',      label: '📋 Criar Cópia do Card' }  // NOVO
```

---

## Fora de Escopo

- Cópia de anexos (`attachments`)
- Cópia de histórico técnico (`technical_history`)
- Link pai-filho entre original e cópia
- Novos triggers além de `card_enter_stage`
- Novas actions além de `create_copy` nesta iteração
