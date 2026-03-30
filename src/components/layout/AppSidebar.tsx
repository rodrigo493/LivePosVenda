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

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Meu Painel", url: "/meu-painel", icon: User },
  { title: "CRM Pipeline", url: "/crm", icon: Kanban },
  { title: "Clientes", url: "/clientes", icon: Users },
  { title: "Equipamentos", url: "/equipamentos", icon: Package },
];

const operationsNav = [
  { title: "Chamados", url: "/chamados", icon: HeadphonesIcon },
  { title: "Pedidos de Acessórios", url: "/pedidos-acessorios", icon: Package },
  { title: "Pedidos de Garantia", url: "/pedidos-garantia", icon: ShieldCheck },
  { title: "Orçamentos", url: "/orcamentos", icon: FileText },
  { title: "Ordens de Serviço", url: "/ordens-servico", icon: ClipboardList },
  { title: "Manutenção Prev.", url: "/manutencao", icon: CalendarClock },
];

const managementNav = [
  { title: "Produtos e Peças", url: "/produtos", icon: Box },
  { title: "Serviços", url: "/servicos", icon: Wrench },
  { title: "Técnicos", url: "/tecnicos", icon: HardHat },
  { title: "Importar Histórico", url: "/importar-historico", icon: FileSpreadsheet },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Engenharia", url: "/engenharia", icon: FlaskConical },
  { title: "Manual do Usuário", url: "/manual", icon: BookOpen },
];

const otherNav = [
  { title: "Portal do Cliente", url: "/portal", icon: UserCircle },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const renderMenuItem = (item: { title: string; url: string; icon: React.ElementType }) => {
    const link = (
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
              <SidebarMenuButton asChild>{link}</SidebarMenuButton>
            </SidebarMenuItem>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.title}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>{link}</SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const renderGroup = (label: string, items: typeof mainNav) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
