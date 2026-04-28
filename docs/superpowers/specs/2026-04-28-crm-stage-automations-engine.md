# CRM Stage Automations — Execution Engine

**Date:** 2026-04-28
**Status:** Approved for implementation

---

## Overview

Implement the execution engine for CRM pipeline stage automations. The data model and configuration UI already exist; what is missing is the trigger, queue, and executor that make automations actually run when a card moves to a stage.

---

## Scope

### In scope
- `delay_minutes` field per automation (migration)
- `pipeline_automation_queue` table (migration)
- Edge function `trigger-automations` — called when a card moves to a stage
- Edge function `execute-automations` — called by pg_cron every minute
- pg_cron job scheduling
- Variable resolution: `{{cliente_nome}}`, `{{tecnico_nome}}`, `{{tecnico_telefone}}`, `{{etapa_nome}}`, `{{funil_nome}}`, `{{ticket_numero}}`
- WhatsApp action: sends via existing `send-whatsapp` edge function
- Squad task action: `POST` to Squad API (endpoint to confirm during implementation)
- Squad workspace notify action: `POST` to Squad API (endpoint to confirm)
- UI: add `delay_minutes` field, `to` phone field for WhatsApp, variable chips, Squad user dropdown in `AutomationRow.tsx`
- Hook: call `trigger-automations` from `useMovePipelineStage`

### Out of scope (v1)
- Retry logic for failed automations
- Email action (scaffold config UI only, no executor)
- move_stage action executor
- Automation execution history UI

---

## Data Model

### Migration 1 — Add `delay_minutes` to automations

```sql
ALTER TABLE pipeline_stage_automations
  ADD COLUMN delay_minutes INT NOT NULL DEFAULT 0;
```

### Migration 2 — Automation queue

```sql
CREATE TABLE pipeline_automation_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID        NOT NULL REFERENCES pipeline_stage_automations(id) ON DELETE CASCADE,
  ticket_id     UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  stage_id      UUID        NOT NULL REFERENCES pipeline_stages(id),
  execute_at    TIMESTAMPTZ NOT NULL,
  executed_at   TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'pending', -- pending | done | failed
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pipeline_automation_queue_pending_idx
  ON pipeline_automation_queue (execute_at)
  WHERE status = 'pending';
```

---

## action_config Schema

| `action_type` | Fields |
|---|---|
| `whatsapp_message` | `to: string` (static number or `{{var}}`), `message: string` |
| `create_task` | `title: string`, `description: string`, `squad_user_id: string` |
| `notify_user` | `message: string`, `squad_user_id: string` |
| `send_email` | `to: string`, `subject: string`, `body: string` |
| `move_stage` | `target_stage_id: string` |

---

## Variable Resolution

At execution time, the executor fetches the ticket with joins and builds a substitution map:

| Variable | Source |
|---|---|
| `{{cliente_nome}}` | `tickets.clients.name` |
| `{{tecnico_nome}}` | `tickets.users.name` (assigned user) |
| `{{tecnico_telefone}}` | `tickets.users.phone` |
| `{{etapa_nome}}` | `pipeline_stages.label` |
| `{{funil_nome}}` | `pipelines.name` |
| `{{ticket_numero}}` | `tickets.id` (short form) |

Substitution applies to all string fields in `action_config` before execution.

---

## Execution Flow

```
useMovePipelineStage() [frontend]
  → existing: UPDATE tickets SET pipeline_stage = ?
  → new: POST /functions/v1/trigger-automations { ticket_id, stage_id }
      → SELECT automations WHERE stage_id = ? AND is_active = true
      → INSERT pipeline_automation_queue for each automation
         { execute_at: NOW() + delay_minutes * interval '1 minute' }
      → returns 200 immediately (fire and forget from frontend perspective)

pg_cron: every 1 minute
  → POST /functions/v1/execute-automations
      → SELECT FROM pipeline_automation_queue
          WHERE status = 'pending' AND execute_at <= NOW()
          LIMIT 50
          FOR UPDATE SKIP LOCKED
      → for each entry:
          1. resolve variables (fetch ticket + joins)
          2. execute action by action_type
          3. UPDATE status = 'done' | 'failed', executed_at = NOW()
```

---

## Edge Functions

### `trigger-automations`

**Input:** `{ ticket_id: string, stage_id: string }`

**Logic:**
1. Fetch active automations for `stage_id`
2. Insert one queue entry per automation with `execute_at = NOW() + delay_minutes mins`
3. Return `{ queued: N }`

### `execute-automations`

**Input:** none (called by pg_cron)

**Logic:**
1. Claim up to 50 pending entries (`FOR UPDATE SKIP LOCKED`)
2. For each entry:
   a. Load ticket with joins (client, assigned user, stage, pipeline)
   b. Build variable map
   c. Resolve all string fields in `action_config`
   d. Execute action:
      - `whatsapp_message` → call `send-whatsapp` edge function
      - `create_task` → POST to Squad tasks API
      - `notify_user` → POST to Squad workspace notify API
      - `send_email` → no-op with log (v1)
      - `move_stage` → no-op with log (v1)
   e. Mark `done` or `failed`

---

## pg_cron Job

```sql
SELECT cron.schedule(
  'execute-stage-automations',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/execute-automations',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

---

## UI Changes — `AutomationRow.tsx`

### All action types
- Add `delay_minutes` number input: `"Executar após: [__] minutos"`

### `whatsapp_message`
- Add `to` text input: `"Para: [número ou {{var}}]"`
- Add variable chips below message textarea: clicking inserts `{{var}}` at cursor

### `create_task` (Squad)
- Fields: `title`, `description`, `squad_user_id` (dropdown fetched from Squad API)

### `notify_user` (Squad)
- Fields: `message` (with variable chips), `squad_user_id` (dropdown)

### Variable chips (shared component)
Chips for: `{{cliente_nome}}` `{{tecnico_nome}}` `{{tecnico_telefone}}` `{{etapa_nome}}` `{{funil_nome}}` `{{ticket_numero}}`

---

## Squad API Dependencies

During implementation, confirm these endpoints via curl on the VPS before coding:

| Purpose | Likely endpoint |
|---|---|
| List workspace users | `GET /api/users` or `/api/workspace/users` |
| Create task | `POST /api/tasks` |
| Notify user in workspace | `POST /api/workspace/notify` or `/api/messages` |

Authentication: `Bearer SQUAD_TOKEN` (same token as squad-notify function).

---

## Hook Change — `useMovePipelineStage`

After the existing `UPDATE tickets` call succeeds, fire-and-forget:

```typescript
supabase.functions.invoke('trigger-automations', {
  body: { ticket_id: ticketId, stage_id: targetStageId }
})
// no await — do not block card movement on automation scheduling
```

---

## Error Handling

- `trigger-automations` failure: log to console, do NOT block card movement
- `execute-automations` action failure: mark queue entry `failed` with error text; no retry in v1
- Variable resolution failure (missing field): use empty string, log warning

---

## Out of Scope for v1

- Retry logic
- Email executor
- move_stage executor
- UI to view automation execution history / queue status
