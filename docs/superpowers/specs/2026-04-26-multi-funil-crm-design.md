# Design: Sistema Multi-Funil CRM

**Data:** 2026-04-26  
**Status:** Aprovado  
**Escopo:** CrmPipelinePage — múltiplos funis, etapas editáveis, controle de acesso por usuário

---

## Resumo

Adicionar suporte a múltiplos funis no CRM. Cada funil tem suas próprias etapas configuráveis. O admin gerencia funis, etapas e acessos através de um ícone ⚙️. Usuários navegam entre funis por um seletor discreto. Cada usuário vê apenas os funis e etapas que o admin liberou.

As etapas hoje são hardcoded em `PIPELINE_STAGES` (`usePipeline.ts`). Essa constante será substituída por queries ao banco de dados.

---

## Modelo de Dados

### Novas tabelas

```sql
-- Funis
CREATE TABLE pipelines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  position    INT  NOT NULL DEFAULT 0,
  is_active   BOOL NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Etapas de cada funil
CREATE TABLE pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'hsl(0 0% 45%)',
  delay_days  INT  NOT NULL DEFAULT 3,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pipeline_id, key)
);

-- Acesso de usuários aos funis
CREATE TABLE pipeline_user_access (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pipeline_id)
);

-- Acesso de usuários às etapas (dentro dos funis liberados)
CREATE TABLE pipeline_stage_user_access (
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, stage_id)
);
```

### Tabela existente modificada

```sql
ALTER TABLE tickets ADD COLUMN pipeline_id UUID REFERENCES pipelines(id);
```

### RLS

| Tabela | SELECT | INSERT/UPDATE/DELETE |
|--------|--------|----------------------|
| `pipelines` | Admin: todos. Usuário: apenas funis com linha em `pipeline_user_access` | Somente admin |
| `pipeline_stages` | Admin: todos. Usuário: apenas etapas com linha em `pipeline_stage_user_access` | Somente admin |
| `pipeline_user_access` | Próprias linhas | Somente admin |
| `pipeline_stage_user_access` | Próprias linhas | Somente admin |

Admin detectado via `useAuth().hasRole('admin')` (padrão existente).

### Migration de dados

1. Criar as 4 novas tabelas
2. Inserir funil padrão "Pós-Venda"
3. Inserir as 6 etapas existentes vinculadas ao funil padrão (ler cores/delays de `system_settings`)
4. `UPDATE tickets SET pipeline_id = <id-pos-venda>` para todos os tickets
5. Tornar `pipeline_id` NOT NULL após o backfill
6. Inserir linhas em `pipeline_user_access` e `pipeline_stage_user_access` para todos os usuários não-admin existentes, liberando acesso total ao funil "Pós-Venda" (retrocompatibilidade)

---

## Arquitetura de Frontend

### Estado novo em `CrmPipelinePage`

```ts
const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(null)
// Inicializa com o primeiro pipeline acessível ao usuário
```

### Hooks novos

| Hook | Responsabilidade |
|------|-----------------|
| `usePipelines()` | Lista pipelines acessíveis (filtra por acesso do usuário; admin vê todos) |
| `useCreatePipeline()` | Mutation: criar pipeline |
| `useUpdatePipeline()` | Mutation: renomear pipeline |
| `useDeletePipeline()` | Mutation: excluir pipeline (bloqueia se tiver tickets) |
| `usePipelineStages(pipelineId)` | Lista etapas acessíveis do pipeline (substitui `PIPELINE_STAGES`) |
| `useCreateStage()` | Mutation: criar etapa |
| `useUpdateStage()` | Mutation: editar etapa (nome, cor, delay_days) |
| `useDeleteStage()` | Mutation: excluir etapa (bloqueia se tiver tickets) |
| `useReorderStages()` | Mutation: atualizar `position` de todas as etapas |
| `useAllUsers()` | Lista todos os usuários não-admin (para dialog de acesso) |
| `useUserAccess(userId)` | Busca funis + etapas liberadas para um usuário específico |
| `useSaveUserAccess()` | Mutation: salva toda a configuração de acesso de um usuário (upsert) |

### Hooks modificados

- **`usePipeline.ts`**: `PIPELINE_STAGES` deixa de ser constante; `usePipelineTickets` recebe `pipelineId`; etapas vêm de `usePipelineStages`
- **`usePipelineSettings.ts`**: removido — delay e cor agora vivem em `pipeline_stages`

### Novos componentes

#### `FunnelSwitcher`
- Botão "▾ trocar funil" ao lado do nome do funil atual
- Abre Popover com lista dos funis acessíveis ao usuário atual
- **Oculto** quando o usuário tem acesso a apenas 1 funil
- Ao selecionar: atualiza `currentPipelineId`

#### `FunnelManagerDropdown` (admin only)
- Ícone ⚙️ ao lado do `FunnelSwitcher`
- Abre dropdown com 3 itens:
  - ✏️ **Editar funil** → `FunnelDialog` em modo edição (funil atual)
  - **+** **Criar funil** → `FunnelDialog` em modo criação
  - 👥 **Acesso de usuários** → `UserAccessDialog`

#### `FunnelDialog`
Dialog modal, modo `'create' | 'edit'`:

- **Campo nome do funil** (editável em ambos os modos)
- **Aba Etapas** — lista com drag-to-reorder (⠿), ✏️ inline (nome + cor + delay_days), 🗑️, "+ Adicionar etapa"
- **Botão Salvar** — persiste nome + etapas
- Modo criação: ao salvar, navega automaticamente para o novo funil

#### `StageRow` (dentro de `FunnelDialog`)
- Handle de drag, bolinha colorida, nome, ✏️, 🗑️
- Ao clicar ✏️: expande inline com campos nome, palette de cores (swatches HSL) e delay_days

#### `UserAccessDialog`
Dialog modal com dois painéis:

**Painel esquerdo — lista de usuários:**
- Exibe todos os usuários não-admin
- Avatar com iniciais, nome, papel
- Clique seleciona o usuário para editar

**Painel direito — funis e etapas do usuário selecionado:**
- Para cada funil: checkbox do funil + lista de etapas com checkboxes individuais
- Marcar funil: auto-marca todas as etapas desse funil
- Desmarcar funil: limpa todas as etapas
- Desmarcar etapa individual: mantém funil acessível mas aquela coluna oculta
- Botão **Salvar** — persiste via `useSaveUserAccess()` (upsert em `pipeline_user_access` + `pipeline_stage_user_access`)

#### `FunnelDeleteGuard`
Toast de erro ao tentar excluir funil ou etapa com tickets:
- Funil: "Não é possível excluir — há X tickets neste funil"
- Etapa: "Não é possível excluir — há X tickets nesta etapa"

---

## Fluxo de Uso

### Navegar entre funis (usuário)
1. Vê nome do funil atual no header
2. Se tiver acesso a mais de 1 funil: clica "▾ trocar funil" → seleciona da lista
3. Kanban recarrega mostrando apenas as etapas liberadas para o usuário

### Editar funil atual (admin)
1. Clica ⚙️ → "Editar funil"
2. Edita nome, reordena/cria/exclui etapas
3. Salva — kanban atualiza

### Criar funil (admin)
1. Clica ⚙️ → "Criar funil"
2. Preenche nome, adiciona etapas
3. Salva — funil criado com acesso somente para o admin; navega para ele

### Controlar acesso de usuários (admin)
1. Clica ⚙️ → "Acesso de usuários"
2. Seleciona um usuário na lista
3. Marca/desmarca funis e etapas
4. Salva — usuário passa a ver apenas o que foi liberado

---

## Regras de Negócio

| Regra | Comportamento |
|-------|--------------|
| Excluir etapa com tickets | Bloqueado — toast de erro |
| Excluir funil com tickets | Bloqueado — toast de erro |
| Excluir funil sem tickets | Permitido — confirma antes |
| Novo funil: acesso padrão | Somente admin |
| Admin | Sempre vê todos os funis e etapas; não aparece no `UserAccessDialog` |
| Marcar funil no `UserAccessDialog` | Auto-marca todas as etapas desse funil |
| Nova etapa adicionada a funil | Admin deve liberar manualmente para usuários em `UserAccessDialog` |
| Usuário sem acesso a nenhum funil | Vê tela "Sem acesso ao CRM" |
| `key` da etapa | Slug auto-gerado a partir do nome, imutável após criação |
| ⚙️ visibilidade | Somente `hasRole('admin')` |
| "▾ trocar funil" visibilidade | Oculto se usuário tem acesso a apenas 1 funil |

---

## Fora de Escopo (próximas iterações)

- **Página de permissões CRM**: controle de acesso a módulos do CRM além do funil (pedidos, orçamentos, garantia, etc.) — página dedicada no nav lateral, admin only
- Mover tickets entre funis diferentes
- Relatórios por funil
