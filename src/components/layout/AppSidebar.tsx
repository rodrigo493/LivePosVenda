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
  CalendarCheck,
} from "lucide-react";
import { NavLink } from "@/components/layout/NavLink";
import posvendaLogo from "@/assets/posvenda.png";
import { useLocation } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCrmPermissionsContext } from "@/contexts/CrmPermissionsContext";

const mainNav = [
  { title: "Meu Painel",     url: "/meu-painel",   icon: User,            moduleKey: null },
  { title: "CRM Pipeline",   url: "/crm",          icon: Kanban,          moduleKey: "crm_pipeline" },
  { title: "Chat WhatsApp",  url: "/chat",         icon: MessageSquare,   moduleKey: "chat_whatsapp" },
  { title: "Clientes",       url: "/clientes",     icon: Users,           moduleKey: "clientes" },
  { title: "Equipamentos",   url: "/equipamentos", icon: Package,         moduleKey: "equipamentos" },
];

const operationsNav = [
  { title: "Tarefas",                url: "/tarefas",            icon: CalendarCheck,  moduleKey: "tarefas" },
  { title: "Chamados",              url: "/chamados",           icon: HeadphonesIcon, moduleKey: "chamados" },
  { title: "Pedidos de Acessórios", url: "/pedidos-acessorios", icon: Package,        moduleKey: "pedidos_acessorios" },
  { title: "Pedidos de Garantia",   url: "/pedidos-garantia",   icon: ShieldCheck,    moduleKey: "pedidos_garantia" },
  { title: "Orçamentos",            url: "/orcamentos",         icon: FileText,       moduleKey: "orcamentos" },
  { title: "Ordens de Serviço",     url: "/ordens-servico",     icon: ClipboardList,  moduleKey: "ordens_servico" },
  { title: "Manutenção Prev.",      url: "/manutencao",         icon: CalendarClock,  moduleKey: "manutencao" },
];

const managementNav = [
  { title: "Produtos e Peças",   url: "/produtos",           icon: Box,             moduleKey: "produtos_pecas" },
  { title: "Serviços",           url: "/servicos",           icon: Wrench,          moduleKey: "servicos" },
  { title: "Técnicos",           url: "/tecnicos",           icon: HardHat,         moduleKey: "tecnicos" },
  { title: "Importar Histórico", url: "/importar-historico", icon: FileSpreadsheet, moduleKey: "importar_historico" },
  { title: "Relatórios",         url: "/relatorios",         icon: BarChart3,       moduleKey: "relatorios" },
  { title: "Engenharia",         url: "/engenharia",         icon: FlaskConical,    moduleKey: "engenharia" },
  { title: "Manual do Usuário",  url: "/manual",             icon: BookOpen,        moduleKey: "manual_usuario" },
];

const otherNav = [
  { title: "Portal do Cliente", url: "/portal",        icon: UserCircle, moduleKey: "portal_cliente" },
  { title: "Configurações",     url: "/configuracoes", icon: Settings,   moduleKey: null },
];

const adminNav = [
  { title: "Dashboard",      url: "/",               icon: LayoutDashboard, moduleKey: null },
  { title: "Permissões CRM", url: "/crm-permissions", icon: Shield,          moduleKey: null },
];

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
