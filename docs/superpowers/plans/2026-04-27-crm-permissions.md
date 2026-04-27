# CRM Permissions & Client Visibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar controle de acesso por módulo CRM (per-user), ícone de cadeado na sidebar para módulos bloqueados, página de administração de permissões e visibilidade de clientes por criador.

**Architecture:** Tabela `crm_module_permissions (user_id, module_key)` controla acesso. `CrmPermissionsContext` carrega permissões do usuário logado via `useMyPermissions()` e expõe `hasPermission(key)`. Sidebar lê o contexto e renderiza cadeado. Admins (`hasRole('admin')`) sempre têm acesso total — bypass no hook. Clientes ganham coluna `created_by` com RLS que filtra por criador.

**Tech Stack:** React 18 + TypeScript, Supabase (PostgreSQL + RLS), @tanstack/react-query, shadcn/ui, lucide-react, react-router-dom, sonner (toasts).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `supabase/migrations/20260427000050_crm_module_permissions.sql` | Create | Tabela crm_module_permissions + clients.created_by + RLS |
| `src/lib/crmModules.ts` | Create | CRM_MODULES constant com key/label/section de cada módulo |
| `src/hooks/useCrmPermissions.ts` | Create | useCrmModulePermissions (admin page) + useSaveCrmPermissions |
| `src/hooks/useMyPermissions.ts` | Create | Hook que carrega permissões do usuário logado |
| `src/contexts/CrmPermissionsContext.tsx` | Create | Provider + useCrmPermissionsContext |
| `src/components/layout/AppSidebar.tsx` | Modify | moduleKey nos nav items, lock icon, seção Administração |
| `src/App.tsx` | Modify | CrmPermissionsProvider, lazy import + rota /crm-permissions |
| `src/pages/CrmPermissionsPage.tsx` | Create | Página admin de permissões (split panel) |
| `src/hooks/useClients.ts` | Modify | useCreateClient injeta created_by: user.id |

---

## Task 1: Migration — crm_module_permissions + clients.created_by

**Files:**
- Create: `supabase/migrations/20260427000050_crm_module_permissions.sql`

- [ ] **Step 1: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260427000050_crm_module_permissions.sql

-- 1. Tabela de permissões de módulos CRM por usuário
CREATE TABLE public.crm_module_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_key)
);
ALTER TABLE public.crm_module_permissions ENABLE ROW LEVEL SECURITY;

-- Admins podem ler/escrever tudo; usuários leem apenas as próprias
CREATE POLICY "crm_perms_admin_all" ON public.crm_module_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "crm_perms_user_select" ON public.crm_module_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Adicionar created_by à tabela clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 3. RLS para clients: usuário vê seus clientes; admin vê todos; legados (null) visíveis a todos
-- Remover política de select existente (se houver) e criar nova
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;

CREATE POLICY "clients_select_owner_or_admin" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR created_by IS NULL
    OR auth.uid() = created_by
  );

-- 4. RLS insert: obriga created_by = auth.uid()
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;

CREATE POLICY "clients_insert_owner" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
```

- [ ] **Step 2: Aplicar a migration**

```bash
npx supabase db push
```

Resultado esperado: `Applying migration 20260427000050_crm_module_permissions.sql... done`

- [ ] **Step 3: Verificar no Supabase Dashboard**

Confirmar que `crm_module_permissions` aparece em Table Editor e que `clients` tem coluna `created_by`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260427000050_crm_module_permissions.sql
git commit -m "feat(db): crm_module_permissions table + clients.created_by RLS"
```

---

## Task 2: CRM_MODULES constant

**Files:**
- Create: `src/lib/crmModules.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
// src/lib/crmModules.ts

export const CRM_MODULES = [
  { key: "crm_pipeline",       label: "CRM Pipeline",          section: "Principal"  },
  { key: "chat_whatsapp",      label: "Chat WhatsApp",         section: "Principal"  },
  { key: "clientes",           label: "Clientes",              section: "Principal"  },
  { key: "equipamentos",       label: "Equipamentos",          section: "Principal"  },
  { key: "chamados",           label: "Chamados",              section: "Operações"  },
  { key: "pedidos_acessorios", label: "Pedidos de Acessórios", section: "Operações"  },
  { key: "pedidos_garantia",   label: "Pedidos de Garantia",   section: "Operações"  },
  { key: "orcamentos",         label: "Orçamentos",            section: "Operações"  },
  { key: "ordens_servico",     label: "Ordens de Serviço",     section: "Operações"  },
  { key: "manutencao",         label: "Manutenção Prev.",      section: "Operações"  },
  { key: "relatorios",         label: "Relatórios",            section: "Gestão"     },
  { key: "produtos_pecas",     label: "Produtos e Peças",      section: "Gestão"     },
  { key: "servicos",           label: "Serviços",              section: "Gestão"     },
  { key: "tecnicos",           label: "Técnicos",              section: "Gestão"     },
  { key: "engenharia",         label: "Engenharia",            section: "Gestão"     },
  { key: "importar_historico", label: "Importar Histórico",    section: "Gestão"     },
  { key: "manual_usuario",     label: "Manual do Usuário",     section: "Gestão"     },
  { key: "portal_cliente",     label: "Portal do Cliente",     section: "Outros"     },
] as const;

export type CrmModuleKey = typeof CRM_MODULES[number]["key"];

export const CRM_SECTIONS = ["Principal", "Operações", "Gestão", "Outros"] as const;
export type CrmSection = typeof CRM_SECTIONS[number];

export function getModulesBySection(section: CrmSection) {
  return CRM_MODULES.filter((m) => m.section === section);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/crmModules.ts
git commit -m "feat(crm): CRM_MODULES constant with module keys and sections"
```

---

## Task 3: useCrmPermissions hook (para a página admin)

**Files:**
- Create: `src/hooks/useCrmPermissions.ts`

- [ ] **Step 1: Criar o hook**

```typescript
// src/hooks/useCrmPermissions.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCrmModulePermissions(userId: string | null) {
  return useQuery({
    queryKey: ["crm-module-permissions", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("crm_module_permissions")
        .select("module_key")
        .eq("user_id", userId);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.module_key as string));
    },
    staleTime: 30_000,
  });
}

export function useSaveCrmPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, grantedKeys }: { userId: string; grantedKeys: string[] }) => {
      await (supabase as any)
        .from("crm_module_permissions")
        .delete()
        .eq("user_id", userId);
      if (grantedKeys.length > 0) {
        const { error } = await (supabase as any)
          .from("crm_module_permissions")
          .insert(grantedKeys.map((key) => ({ user_id: userId, module_key: key })));
        if (error) throw error;
      }
    },
    onSuccess: (_: void, vars: { userId: string }) => {
      qc.invalidateQueries({ queryKey: ["crm-module-permissions", vars.userId] });
      qc.invalidateQueries({ queryKey: ["my-crm-permissions"] });
      toast.success("Permissões salvas");
    },
    onError: () => toast.error("Erro ao salvar permissões"),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCrmPermissions.ts
git commit -m "feat(crm): useCrmModulePermissions + useSaveCrmPermissions hooks"
```

---

## Task 4: useMyPermissions hook (para o contexto)

**Files:**
- Create: `src/hooks/useMyPermissions.ts`

- [ ] **Step 1: Criar o hook**

```typescript
// src/hooks/useMyPermissions.ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface MyPermissionsResult {
  perms: Set<string> | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useMyPermissions(): MyPermissionsResult {
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("admin");

  const { data: perms = null, isLoading } = useQuery({
    queryKey: ["my-crm-permissions", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("crm_module_permissions")
        .select("module_key")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.module_key as string));
    },
    staleTime: 60_000,
  });

  return {
    perms,
    isAdmin,
    loading: isLoading && !isAdmin,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useMyPermissions.ts
git commit -m "feat(crm): useMyPermissions hook — loads current user module access"
```

---

## Task 5: CrmPermissionsContext

**Files:**
- Create: `src/contexts/CrmPermissionsContext.tsx`

- [ ] **Step 1: Criar o context**

```typescript
// src/contexts/CrmPermissionsContext.tsx
import { createContext, useContext } from "react";
import { useMyPermissions } from "@/hooks/useMyPermissions";

interface CrmPermissionsContextType {
  hasPermission: (key: string) => boolean;
  isAdmin: boolean;
}

const CrmPermissionsContext = createContext<CrmPermissionsContextType>({
  hasPermission: () => true,
  isAdmin: false,
});

export function CrmPermissionsProvider({ children }: { children: React.ReactNode }) {
  const { perms, isAdmin, loading } = useMyPermissions();

  const hasPermission = (key: string): boolean => {
    if (isAdmin) return true;
    if (loading || perms === null) return true; // permissivo enquanto carrega
    return perms.has(key);
  };

  return (
    <CrmPermissionsContext.Provider value={{ hasPermission, isAdmin }}>
      {children}
    </CrmPermissionsContext.Provider>
  );
}

export function useCrmPermissionsContext() {
  return useContext(CrmPermissionsContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/CrmPermissionsContext.tsx
git commit -m "feat(crm): CrmPermissionsContext — hasPermission + isAdmin via context"
```

---

## Task 6: AppSidebar — lock icon + admin section

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Adicionar imports**

No topo do arquivo, adicionar `Lock` e `Shield` aos imports do lucide-react (linha 1):

```typescript
import {
  LayoutDashboard,
  Users,
  Package,
  HeadphonesIcon,
  ShieldCheck,
  Wrench,
  ClipboardList,
  CalendarClock,
  Box,
  FileText,
  BarChart3,
  FlaskConical,
  UserCircle,
  Settings,
  ChevronLeft,
  FileSpreadsheet,
  Kanban,
  User,
  BookOpen,
  HardHat,
  MessageSquare,
  Lock,
  Shield,
} from "lucide-react";
```

Adicionar import do context (após os imports existentes):

```typescript
import { useCrmPermissionsContext } from "@/contexts/CrmPermissionsContext";
```

- [ ] **Step 2: Adicionar moduleKey nas arrays de nav**

Substituir as 4 arrays de nav existentes pelas versões com `moduleKey`:

```typescript
const mainNav = [
  { title: "Dashboard",      url: "/",            icon: LayoutDashboard, moduleKey: null },
  { title: "Meu Painel",     url: "/meu-painel",  icon: User,            moduleKey: null },
  { title: "CRM Pipeline",   url: "/crm",         icon: Kanban,          moduleKey: "crm_pipeline" },
  { title: "Chat WhatsApp",  url: "/chat",        icon: MessageSquare,   moduleKey: "chat_whatsapp" },
  { title: "Clientes",       url: "/clientes",    icon: Users,           moduleKey: "clientes" },
  { title: "Equipamentos",   url: "/equipamentos",icon: Package,         moduleKey: "equipamentos" },
];

const operationsNav = [
  { title: "Chamados",              url: "/chamados",           icon: HeadphonesIcon, moduleKey: "chamados" },
  { title: "Pedidos de Acessórios", url: "/pedidos-acessorios", icon: Package,        moduleKey: "pedidos_acessorios" },
  { title: "Pedidos de Garantia",   url: "/pedidos-garantia",   icon: ShieldCheck,    moduleKey: "pedidos_garantia" },
  { title: "Orçamentos",            url: "/orcamentos",         icon: FileText,       moduleKey: "orcamentos" },
  { title: "Ordens de Serviço",     url: "/ordens-servico",     icon: ClipboardList,  moduleKey: "ordens_servico" },
  { title: "Manutenção Prev.",      url: "/manutencao",         icon: CalendarClock,  moduleKey: "manutencao" },
];

const managementNav = [
  { title: "Produtos e Peças",   url: "/produtos",           icon: Box,           moduleKey: "produtos_pecas" },
  { title: "Serviços",           url: "/servicos",           icon: Wrench,        moduleKey: "servicos" },
  { title: "Técnicos",           url: "/tecnicos",           icon: HardHat,       moduleKey: "tecnicos" },
  { title: "Importar Histórico", url: "/importar-historico", icon: FileSpreadsheet,moduleKey: "importar_historico" },
  { title: "Relatórios",         url: "/relatorios",         icon: BarChart3,     moduleKey: "relatorios" },
  { title: "Engenharia",         url: "/engenharia",         icon: FlaskConical,  moduleKey: "engenharia" },
  { title: "Manual do Usuário",  url: "/manual",             icon: BookOpen,      moduleKey: "manual_usuario" },
];

const otherNav = [
  { title: "Portal do Cliente", url: "/portal",        icon: UserCircle, moduleKey: "portal_cliente" },
  { title: "Configurações",     url: "/configuracoes", icon: Settings,   moduleKey: null },
];

const adminNav = [
  { title: "Permissões CRM", url: "/crm-permissions", icon: Shield, moduleKey: null },
];
```

- [ ] **Step 3: Atualizar AppSidebar para usar o context e o tipo correto**

Substituir a função `AppSidebar` inteira:

```typescript
export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const { hasPermission, isAdmin } = useCrmPermissionsContext();

  type NavItem = { title: string; url: string; icon: React.ElementType; moduleKey: string | null };

  const renderMenuItem = (item: NavItem) => {
    const locked = item.moduleKey !== null && !hasPermission(item.moduleKey);

    const content = locked ? (
      <span
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-40 cursor-default select-none ${
          collapsed ? "justify-center" : ""
        }`}
        title="Sem acesso"
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1">{item.title}</span>
            <Lock className="h-3 w-3 text-muted-foreground" />
          </>
        )}
      </span>
    ) : (
      <NavLink
        to={item.url}
        end={item.url === "/"}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
          isActive(item.url)
            ? "bg-sidebar-accent text-sidebar-primary font-medium"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        }`}
        activeClassName=""
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span>{item.title}</span>}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.title}>
          <TooltipTrigger asChild>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>{content}</SidebarMenuButton>
            </SidebarMenuItem>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {locked ? `${item.title} (sem acesso)` : item.title}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>{content}</SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      {!collapsed && (
        <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-[10px] tracking-widest font-medium">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>{items.map(renderMenuItem)}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <img
            src={posvendaLogo}
            alt="Live Pós Venda"
            className={collapsed ? "h-6 w-auto" : "h-10 w-auto"}
          />
          <button
            onClick={toggleSidebar}
            className="text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            <ChevronLeft className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>
      </SidebarHeader>

      <SidebarContent className={collapsed ? "px-0" : "px-2"}>
        {renderGroup("Principal", mainNav)}
        {renderGroup("Operações", operationsNav)}
        {renderGroup("Gestão", managementNav)}
        {renderGroup("Outros", otherNav)}
        {isAdmin && renderGroup("Administração", adminNav)}
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 4: Verificar build sem erros**

```bash
npm run typecheck
```

Resultado esperado: sem erros de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "feat(sidebar): lock icon for restricted modules + admin section"
```

---

## Task 7: App.tsx — wiring do provider e rota

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Adicionar import do provider e do lazy page**

No topo de `src/App.tsx`, após os imports existentes de contexto/hooks (linha após `import { AppLayout...}`):

```typescript
import { CrmPermissionsProvider } from "@/contexts/CrmPermissionsContext";
const CrmPermissionsPage = lazy(() => import("./pages/CrmPermissionsPage"));
```

- [ ] **Step 2: Envolver AppLayout com o provider**

No `AppRoutes`, na seção autenticada (o `return` com `<AppLayout>`), envolver com `CrmPermissionsProvider`:

```typescript
  return (
    <CrmPermissionsProvider>
      <AppLayout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/equipamentos" element={<EquipmentPage />} />
            <Route path="/chamados" element={<TicketsPage />} />
            <Route path="/garantias" element={<WarrantiesPage />} />
            <Route path="/assistencia" element={<ServiceRequestsPage />} />
            <Route path="/pedidos-acessorios" element={<PedidosAcessoriosPage />} />
            <Route path="/pedidos-acessorios/:id" element={<PADetailPage />} />
            <Route path="/pedidos-garantia" element={<PedidosGarantiaPage />} />
            <Route path="/pedidos-garantia/:id" element={<PGDetailPage />} />
            <Route path="/orcamentos" element={<QuotesPage />} />
            <Route path="/orcamentos/:id" element={<QuoteDetailPage />} />
            <Route path="/ordens-servico" element={<WorkOrdersPage />} />
            <Route path="/ordens-servico/:id" element={<WorkOrderDetailPage />} />
            <Route path="/manutencao" element={<MaintenancePage />} />
            <Route path="/produtos" element={<ProductsPage />} />
            <Route path="/servicos" element={<ServicesPage />} />
            <Route path="/tecnicos" element={<TechniciansPage />} />
            <Route path="/relatorios" element={<ReportsPage />} />
            <Route path="/engenharia" element={<EngineeringPage />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/importar-historico" element={<HistoricalImportPage />} />
            <Route path="/crm" element={<CrmPipelinePage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/meu-painel" element={<MyDashboardPage />} />
            <Route path="/manual" element={<ManualPage />} />
            <Route path="/crm-permissions" element={<CrmPermissionsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppLayout>
    </CrmPermissionsProvider>
  );
```

- [ ] **Step 3: Verificar build**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): CrmPermissionsProvider + route /crm-permissions"
```

---

## Task 8: CrmPermissionsPage

**Files:**
- Create: `src/pages/CrmPermissionsPage.tsx`

- [ ] **Step 1: Criar a página**

```typescript
// src/pages/CrmPermissionsPage.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Check } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAllUsers } from "@/hooks/useUserAccess";
import { useCrmModulePermissions, useSaveCrmPermissions } from "@/hooks/useCrmPermissions";
import { CRM_MODULES, CRM_SECTIONS } from "@/lib/crmModules";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

const SECTION_COLORS: Record<string, string> = {
  Principal:  "bg-blue-500/20 text-blue-400",
  Operações:  "bg-orange-500/20 text-orange-400",
  Gestão:     "bg-purple-500/20 text-purple-400",
  Outros:     "bg-gray-500/20 text-gray-400",
};

const CrmPermissionsPage = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasRole("admin")) navigate("/");
  }, [hasRole, navigate]);

  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const { data: userPerms } = useCrmModulePermissions(selectedUserId);
  const savePerms = useSaveCrmPermissions();

  // Sincroniza checkboxes quando um usuário é selecionado
  useEffect(() => {
    if (userPerms !== undefined) {
      setChecked(new Set(userPerms));
    }
  }, [userPerms, selectedUserId]);

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSection(section: string) {
    const sectionKeys = CRM_MODULES.filter((m) => m.section === section).map((m) => m.key);
    const allChecked = sectionKeys.every((k) => checked.has(k));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        sectionKeys.forEach((k) => next.delete(k));
      } else {
        sectionKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }

  function handleSave() {
    if (!selectedUserId) return;
    savePerms.mutate({ userId: selectedUserId, grantedKeys: [...checked] });
  }

  const selectedUser = users.find((u) => u.user_id === selectedUserId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissões CRM"
        subtitle="Controle quais módulos cada usuário pode acessar"
        icon={<Shield className="h-5 w-5 text-violet-400" />}
      />

      <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[400px]">
        {/* Painel de usuários */}
        <div className="w-64 flex-shrink-0 border border-border rounded-xl overflow-hidden bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Usuários</p>
          </div>
          <ScrollArea className="h-full">
            {usersLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Carregando...</div>
            ) : users.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Nenhum usuário encontrado</div>
            ) : (
              users.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => setSelectedUserId(u.user_id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/50 transition-colors hover:bg-muted/50 ${
                    selectedUserId === u.user_id ? "bg-primary/10 border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-semibold text-primary">{getInitials(u.full_name || u.email)}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{u.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Painel de módulos */}
        <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card flex flex-col">
          {!selectedUserId ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione um usuário para gerenciar as permissões
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Permissões de <span className="text-foreground font-medium">{selectedUser?.full_name || selectedUser?.email}</span>
                </p>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={savePerms.isPending}
                  className="h-8"
                >
                  {savePerms.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-5 space-y-6">
                  {CRM_SECTIONS.map((section) => {
                    const modules = CRM_MODULES.filter((m) => m.section === section);
                    const allChecked = modules.every((m) => checked.has(m.key));
                    const someChecked = modules.some((m) => checked.has(m.key));

                    return (
                      <div key={section}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {section}
                          </span>
                          <button
                            onClick={() => toggleSection(section)}
                            className="text-xs text-primary hover:underline"
                          >
                            {allChecked ? "Desmarcar todos" : "Marcar todos"}
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {modules.map((m) => (
                            <button
                              key={m.key}
                              onClick={() => toggle(m.key)}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                                checked.has(m.key)
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                              }`}
                            >
                              <div className={`h-4 w-4 rounded flex items-center justify-center border flex-shrink-0 ${
                                checked.has(m.key) ? "bg-primary border-primary" : "border-muted-foreground/40"
                              }`}>
                                {checked.has(m.key) && <Check className="h-2.5 w-2.5 text-white" />}
                              </div>
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrmPermissionsPage;
```

- [ ] **Step 2: Verificar build**

```bash
npm run typecheck
```

Verificar que `PageHeader` aceita prop `icon` (verificar se existe ou ajustar).

- [ ] **Step 3: Commit**

```bash
git add src/pages/CrmPermissionsPage.tsx
git commit -m "feat(crm): CrmPermissionsPage — split panel admin permissions management"
```

---

## Task 9: useCreateClient — injetar created_by

**Files:**
- Modify: `src/hooks/useClients.ts`

- [ ] **Step 1: Atualizar o hook para injetar created_by**

Substituir `useCreateClient` em `src/hooks/useClients.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClientInsert } from "@/types/database";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (client: ClientInsert) => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .insert({ ...client, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ClientInsert>) => {
      const { data, error } = await supabase
        .from("clients")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}
```

- [ ] **Step 2: Verificar build**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useClients.ts
git commit -m "feat(clients): inject created_by on client creation for RLS visibility"
```

---

## Task 10: Smoke test + PageHeader check

**Files:**
- Modify: `src/pages/CrmPermissionsPage.tsx` (se necessário)

- [ ] **Step 1: Verificar a interface PageHeader**

```bash
grep -n "interface PageHeaderProps\|icon" src/components/layout/PageHeader.tsx
```

Se `PageHeader` não aceitar prop `icon`, remover o `icon` e usar apenas `title` e `subtitle` na `CrmPermissionsPage`.

- [ ] **Step 2: Rodar o dev server e testar manualmente**

```bash
npm run dev
```

Como admin:
1. Acessar `/crm-permissions` — deve aparecer a página de permissões
2. Selecionar um usuário — checkboxes devem carregar
3. Desmarcar um módulo e salvar — toast "Permissões salvas"
4. Verificar na sidebar que o módulo aparece com cadeado para esse usuário

Como usuário não-admin:
1. Login com usuário não-admin
2. Verificar que módulos bloqueados aparecem com cadeado na sidebar
3. Acessar `/clientes` — deve mostrar apenas os clientes criados por ele
4. Criar um novo cliente — `created_by` deve ser preenchido automaticamente

- [ ] **Step 3: Verificar lint**

```bash
npm run lint
```

- [ ] **Step 4: Deploy**

```bash
python vps_deploy.py
```

---

## Notas para o implementador

**RLS policies em `clients`:** A migration dropa as policies existentes antes de criar novas. Se houver nomes diferentes de policies no banco, o DROP pode silenciosamente não fazer nada — verificar no Supabase Dashboard em Authentication > Policies > clients antes de rodar a migration.

**`PageHeader` com icon:** Verificar se o componente aceita prop `icon`. Em muitas páginas do projeto, `PageHeader` usa `{ title, subtitle }` sem icon. Se necessário, substituir o header por um simples `<div>` com título.

**Usuários sem permissões:** Um usuário novo sem nenhum registro em `crm_module_permissions` verá TODOS os módulos bloqueados (exceto Dashboard e Meu Painel). O admin deve conceder permissões após criar o usuário. Isso é intencional — "negação por padrão".

**Context permissivo no loading:** Enquanto `useMyPermissions` carrega (primeiros ~200ms após login), `hasPermission` retorna `true` para tudo. Isso evita flash de cadeados na sidebar durante o carregamento.
