import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { HeaderAlerts } from "@/components/layout/HeaderAlerts";
import { Bell, Search, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useWhatsAppRealtimeSync } from "@/hooks/useWhatsAppRealtimeSync";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  useWhatsAppRealtimeSync();
  const { user, roles, signOut } = useAuth();

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "?";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">

          {/* ── Header preto: left | center | right ── */}
          <header className="h-14 flex items-center gap-3 border-b border-zinc-800 px-4 bg-black sticky top-0 z-10">

            {/* Esquerda: trigger mobile + busca */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <SidebarTrigger className="md:hidden text-zinc-400 hover:text-zinc-100 shrink-0" />
              <div className="hidden md:flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 min-w-0">
                <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <input
                  placeholder="Buscar chamados, clientes, equipamentos..."
                  className="bg-transparent border-none outline-none text-sm w-56 text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Centro: pílulas de alerta */}
            <div className="flex items-center gap-2 shrink-0">
              <HeaderAlerts />
            </div>

            {/* Direita: sino + avatar */}
            <div className="flex items-center gap-3 flex-1 justify-end">
              <button className="relative p-2 rounded-lg hover:bg-zinc-800 transition-colors">
                <Bell className="h-4 w-4 text-zinc-400" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-primary rounded-full" />
              </button>

              <Popover>
                <PopoverTrigger asChild>
                  <button className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors shrink-0">
                    <span className="text-xs font-medium text-orange-400">{initials}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-0">
                  <div className="p-4 border-b">
                    <p className="text-sm font-medium truncate">
                      {user?.user_metadata?.full_name || user?.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  {roles.length > 0 && (
                    <div className="px-4 py-3 border-b">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                        <Shield className="h-3 w-3" />
                        <span>Perfis</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span key={role} className="text-[10px] uppercase tracking-wider bg-muted px-2 py-0.5 rounded font-medium">
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="p-2">
                    <button
                      onClick={signOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
