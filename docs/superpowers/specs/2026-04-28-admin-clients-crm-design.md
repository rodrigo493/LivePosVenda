# Spec: Admin — Clientes e CRM Card Actions

**Data:** 2026-04-28  
**Status:** Aprovado

## Visão Geral

Conjunto de features restritas (total ou parcialmente) a admins, divididas em dois contextos: **Página de Clientes** e **Card do CRM (TicketDetailDialog)**.

---

## 1. Migrações de Banco de Dados

### 1.1 `clients.assigned_to`
```sql
ALTER TABLE public.clients
  ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;
```
- Identifica o usuário responsável pelo cliente
- Nullable — clientes existentes ficam sem responsável até admin atribuir
- RLS existente mantida; leitura liberada para staff, escrita restrita por permissão de role no frontend

### 1.2 `tickets.is_paused`
```sql
ALTER TABLE public.tickets
  ADD COLUMN is_paused boolean NOT NULL DEFAULT false;
```
- `true` → card oculto do kanban para usuários normais
- Admin sempre vê, com badge "Pausado" no card do kanban

### 1.3 `tickets.deleted_at`
```sql
ALTER TABLE public.tickets
  ADD COLUMN deleted_at timestamptz NULL;
```
- Soft delete: quando preenchido, card some de todas as views
- `NULL` = ativo; não-nulo = deletado
- Sem UI de restauração neste ciclo — recuperação via query direta se necessário

---

## 2. Página de Clientes

### 2.1 Responsável do Cliente (Admin Only)

**Exibição:** nova coluna "Responsável" na tabela de clientes, visível apenas para admin.

**Edição:** dropdown inline com lista de usuários do sistema (`useAllUsers`). Ao selecionar, salva `assigned_to` via `useUpdateClient()` (extensão do hook existente).

**Usuários não-admin:** não veem a coluna.

### 2.2 Lixeira — Deletar Cliente (Admin Only)

- Ícone `Trash2` na coluna de ações, visível apenas para admin
- **Verificação antes de deletar:** busca tickets do cliente onde `deleted_at IS NULL` (qualquer status)
  - Se encontrar tickets ativos → toast de erro: *"Cliente possui N card(s) ativo(s). Encerre-os antes de deletar."*
  - Se não encontrar → dialog de confirmação → `DELETE` permanente em `clients`
- Novo hook: `useDeleteClient()`
- RLS já permite delete para admin (migration existente)

### 2.3 Criar Card com Seletor de Responsável

- O dialog de criação de ticket em `ClientsPage.tsx` ganha campo `<Select>` com lista de usuários
- **Default:** usuário logado (comportamento atual mantido)
- **Visível para todos** os usuários (não só admin) — qualquer usuário pode criar um card já atribuído a um colega
- Campo mapeia para `assigned_to` no ticket criado

---

## 3. Card CRM — Menu 3 Pontos (Admin Only)

### 3.1 Posição e Visibilidade

- Botão `MoreVertical` (Lucide) no header do `TicketDetailDialog`, à direita dos outros badges
- Visível **somente para admin** (`roles.includes("admin")`)
- Abre `DropdownMenu` com três itens

### 3.2 Duplicar Card

**Campos copiados do original:**
| Campo | Valor |
|-------|-------|
| `title` | Original |
| `client_id` | Original |
| `ticket_type` | Original |
| `priority` | Original |
| `assigned_to` | Admin logado |
| `pipeline_id` | Pipeline atual |
| `pipeline_stage` | Primeira etapa do pipeline atual |
| `pipeline_position` | 9999 (final da coluna) |
| `ticket_number` | Gerado automaticamente pelo banco |

**Fluxo:** cria via `useCreateTicket()` → toast de sucesso → fecha dialog → card aparece no kanban na 1ª etapa.

### 3.3 Deletar Card (Soft Delete)

- Item "Deletar" no dropdown abre confirmação inline ("Tem certeza? Esta ação não pode ser desfeita facilmente.")
- Botão de confirmação em vermelho
- Aplica `deleted_at = now()` via `useUpdateTicket()` / novo `useSoftDeleteTicket()`
- Fecha o dialog — card some de todas as views imediatamente

**Filtros a atualizar:** todas as queries de tickets devem incluir `.is('deleted_at', null)` — hooks `usePipelineTickets`, `useTickets`, `useAllTickets`, `useClientTickets`.

### 3.4 Pausar / Despausar Card

**Pausar (`is_paused = false → true`):**
- Item "Pausar card" no dropdown
- Confirmação direta (sem dialog extra)
- Aplica `is_paused = true` → card some do kanban dos usuários normais
- Admin continua vendo no kanban com badge cinza "Pausado" no canto superior do card

**Despausar (`is_paused = true → false`):**
- Item mostra "Despausar card" quando já pausado
- Abre mini-dialog com seletor de etapa (`pipeline_stage`) do pipeline atual
- Admin seleciona etapa → aplica `is_paused = false` + `pipeline_stage` escolhida
- Card retorna ao kanban visível para todos na etapa selecionada

**Filtros a atualizar:**
- Usuários normais: adicionar `.eq('is_paused', false)` + `.is('deleted_at', null)` na query de `usePipelineTickets`
- Admin: adiciona apenas `.is('deleted_at', null)` — vê cards pausados, não vê deletados

**Badge "Pausado" no kanban:**
- Tag cinza no canto superior esquerdo do card kanban quando `is_paused = true`
- Visível apenas para admin (o card inteiro já é oculto para não-admin)

---

## 4. Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/migrations/20260428000001_admin_clients_crm.sql` | 3 novas colunas |
| `src/hooks/useClients.ts` | Extender `useUpdateClient` + novo `useDeleteClient` |
| `src/hooks/usePipeline.ts` | Filtros `deleted_at IS NULL` + `is_paused` por role |
| `src/hooks/useTickets.ts` | Filtro `deleted_at IS NULL` |
| `src/pages/ClientsPage.tsx` | Coluna responsável, lixeira, seletor no dialog |
| `src/pages/CrmPipelinePage.tsx` | Badge "Pausado", filtro is_paused por role |
| `src/components/tickets/TicketDetailDialog.tsx` | Menu 3 pontos (admin), dialog despausar |

---

## 5. Fora do Escopo

- UI de restauração de cards deletados (soft delete sem interface de restore)
- Restauração de clientes deletados
- Histórico de auditoria de ações admin
- Notificação para responsável ao ser atribuído a um cliente
