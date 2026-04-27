# CRM Permissions & Client Visibility — Design Spec

## Goal

Adicionar controle de acesso por módulo CRM (por usuário) e visibilidade de clientes por criador, com página de administração e ícone de cadeado na sidebar para itens bloqueados.

## Architecture

Tabela `crm_module_permissions` (user_id × module_key) controla acesso por módulo. Um `CrmPermissionsContext` carrega as permissões do usuário logado no startup e expõe `hasPermission(key)`. A sidebar lê esse contexto para renderizar cadeado. Uma nova seção "Administração" (admin-only) na sidebar expõe a página `/crm-permissions`. Clientes têm coluna `created_by` com RLS que filtra por criador (admins veem todos).

## Tech Stack

React 18, TypeScript, Supabase (PostgreSQL + RLS), @tanstack/react-query, shadcn/ui, sonner toasts, lucide-react (ícone `Lock`).

---

## 1. Database

### Tabela `crm_module_permissions`

```sql
create table crm_module_permissions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  unique(user_id, module_key)
);
alter table crm_module_permissions enable row level security;

-- Admins gerenciam; usuários leem as próprias
create policy "crm_perms_admin_all" on crm_module_permissions
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "crm_perms_user_select" on crm_module_permissions
  for select to authenticated
  using (auth.uid() = user_id);
```

Semântica: presença do registro = acesso concedido. Ausência = bloqueado. Admins ignoram a tabela (sempre têm acesso total via hook).

### Coluna `created_by` em `clientes`

```sql
alter table clientes add column if not exists created_by uuid references auth.users(id);

-- RLS: usuário vê seus clientes; admin vê todos; null (legados) todos veem
create policy "clientes_owner_or_admin" on clientes
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or created_by is null
    or auth.uid() = created_by
  );

create policy "clientes_insert_set_owner" on clientes
  for insert to authenticated
  with check (auth.uid() = created_by);
```

Observação: registros legados com `created_by = null` são visíveis para todos (tratados como públicos). Política de insert obriga `created_by = auth.uid()`.

---

## 2. Module Definitions

Constante `CRM_MODULES` em `src/lib/crmModules.ts`:

```ts
export const CRM_MODULES = [
  // section: Principal
  { key: 'crm_pipeline',      label: 'CRM Pipeline',          section: 'Principal' },
  { key: 'chat_whatsapp',     label: 'Chat WhatsApp',         section: 'Principal' },
  { key: 'clientes',          label: 'Clientes',              section: 'Principal' },
  { key: 'equipamentos',      label: 'Equipamentos',          section: 'Principal' },
  // section: Operações
  { key: 'chamados',          label: 'Chamados',              section: 'Operações' },
  { key: 'pedidos_acessorios',label: 'Pedidos de Acessórios', section: 'Operações' },
  { key: 'pedidos_garantia',  label: 'Pedidos de Garantia',   section: 'Operações' },
  { key: 'orcamentos',        label: 'Orçamentos',            section: 'Operações' },
  { key: 'ordens_servico',    label: 'Ordens de Serviço',     section: 'Operações' },
  { key: 'manutencao',        label: 'Manutenção Prev.',      section: 'Operações' },
  // section: Gestão
  { key: 'relatorios',        label: 'Relatórios',            section: 'Gestão' },
  { key: 'produtos_pecas',    label: 'Produtos e Peças',      section: 'Gestão' },
  { key: 'servicos',          label: 'Serviços',              section: 'Gestão' },
  { key: 'tecnicos',          label: 'Técnicos',              section: 'Gestão' },
  { key: 'engenharia',        label: 'Engenharia',            section: 'Gestão' },
  { key: 'importar_historico',label: 'Importar Histórico',    section: 'Gestão' },
  { key: 'manual_usuario',    label: 'Manual do Usuário',     section: 'Gestão' },
  // section: Outros
  { key: 'portal_cliente',    label: 'Portal do Cliente',     section: 'Outros' },
] as const;

export type CrmModuleKey = typeof CRM_MODULES[number]['key'];
```

Módulos sempre-on (sem controle de permissão): `dashboard`, `meu_painel`. Módulos admin-only fixos (não aparecem na lista de permissões): `configuracoes`, `crm_permissions`.

---

## 3. Permissions Layer

### Hook `useCrmPermissions` — para a página admin

`src/hooks/useCrmPermissions.ts`

```ts
// Carrega permissões de um usuário específico (admin usa na página de gerenciamento)
export function useCrmModulePermissions(userId: string | null) { ... }
// Retorna Set<CrmModuleKey> dos módulos concedidos

// Salva permissões de um usuário (delete-then-insert)
export function useSaveCrmPermissions() { ... }
// mutationFn: ({ userId, grantedKeys }) => delete all + insert granted
```

### Hook `useMyPermissions` — para sidebar e guards

`src/hooks/useMyPermissions.ts`

```ts
export function useMyPermissions(): Set<string> | 'admin' {
  // Se isAdmin → retorna 'admin' (acesso total)
  // Caso contrário → retorna Set<CrmModuleKey> dos módulos concedidos
}
```

### Context `CrmPermissionsContext`

`src/contexts/CrmPermissionsContext.tsx`

```tsx
const CrmPermissionsContext = createContext<{
  hasPermission: (key: string) => boolean;
}>({ hasPermission: () => true });

export function CrmPermissionsProvider({ children }) {
  const perms = useMyPermissions();
  const hasPermission = (key: string) =>
    perms === 'admin' || perms.has(key);
  return <CrmPermissionsContext.Provider value={{ hasPermission }}>{children}</CrmPermissionsContext.Provider>;
}

export const useCrmPermissionsContext = () => useContext(CrmPermissionsContext);
```

Provider adicionado em `src/App.tsx` (ou `src/main.tsx`) envolvendo as rotas autenticadas.

---

## 4. Sidebar Changes

`src/components/layout/AppSidebar.tsx`

- Cada item de nav ganha campo `moduleKey?: CrmModuleKey`
- Wrapper `NavItem` lê `hasPermission(moduleKey)`:
  - Se `true` → renderiza normalmente
  - Se `false` → renderiza com `Lock` (lucide), `opacity-50`, sem `href`, cursor-default, `title="Sem acesso"`
- Seção nova no final da sidebar (visível só para admins):
  ```tsx
  { title: 'Permissões CRM', url: '/crm-permissions', icon: Shield }
  ```
  Renderizada condicionalmente com `{isAdmin && <AdminNav />}`.

---

## 5. Admin Page `/crm-permissions`

`src/pages/CrmPermissionsPage.tsx`

Layout Option A (painel dividido):
- **Coluna esquerda (30%):** lista de usuários não-admins com nome + email. Clique seleciona o usuário.
- **Coluna direita (70%):** módulos agrupados por seção com checkboxes. Header de grupo tem "marcar todos" toggle.
- **Botão Salvar:** chama `useSaveCrmPermissions()` com os módulos marcados.
- **Estado:** ao selecionar usuário, carrega permissões via `useCrmModulePermissions(userId)` e popula os checkboxes.
- **Guard:** se `!isAdmin`, redireciona para `/` via `useEffect` + `navigate`.

Rota adicionada em `src/App.tsx`:
```tsx
<Route path="/crm-permissions" element={<CrmPermissionsPage />} />
```

---

## 6. Client Visibility

- `useClients()` (hook existente): sem mudança — RLS filtra automaticamente.
- `createCliente` / qualquer insert em `clientes`: incluir `created_by: session.user.id`.
- Localizar todos os pontos de insert em `clientes` no codebase e adicionar o campo.

---

## Data Flow

```
App.tsx
└── CrmPermissionsProvider (carrega useMyPermissions uma vez)
    └── AppSidebar (hasPermission por item)
    └── /crm-permissions (admin only)
        ├── Lista de usuários (useAllUsers)
        ├── useCrmModulePermissions(selectedUserId)
        └── useSaveCrmPermissions()
```

---

## Out of Scope

- Controle de permissão por funil/etapa dentro de um módulo (já coberto por `pipeline_user_access`)
- Auditoria de quem mudou permissões
- Permissões para o módulo Portal do Cliente (requer análise separada de impacto)
