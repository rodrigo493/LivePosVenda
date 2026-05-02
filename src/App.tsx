import React, { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { CrmPermissionsProvider } from "@/contexts/CrmPermissionsContext";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { LaivinhaChat } from "@/components/laivinha/LaivinhaChat";
const ChatPage = lazy(() => import("./pages/ChatPage"));

// Lazy-loaded pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const EquipmentPage = lazy(() => import("./pages/EquipmentPage"));
const TicketsPage = lazy(() => import("./pages/TicketsPage"));
const WarrantiesPage = lazy(() => import("./pages/WarrantiesPage"));
const ServiceRequestsPage = lazy(() => import("./pages/ServiceRequestsPage"));
const PedidosAcessoriosPage = lazy(() => import("./pages/PedidosAcessoriosPage"));
const PADetailPage = lazy(() => import("./pages/PADetailPage"));
const PedidosGarantiaPage = lazy(() => import("./pages/PedidosGarantiaPage"));
const PGDetailPage = lazy(() => import("./pages/PGDetailPage"));
const QuotesPage = lazy(() => import("./pages/QuotesPage"));
const QuoteDetailPage = lazy(() => import("./pages/QuoteDetailPage"));
const WorkOrdersPage = lazy(() => import("./pages/WorkOrdersPage"));
const WorkOrderDetailPage = lazy(() => import("./pages/WorkOrderDetailPage"));
const MaintenancePage = lazy(() => import("./pages/MaintenancePage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const ServicesPage = lazy(() => import("./pages/ServicesPage"));
const TechniciansPage = lazy(() => import("./pages/TechniciansPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const EngineeringPage = lazy(() => import("./pages/EngineeringPage"));
const PortalPage = lazy(() => import("./pages/PortalPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HistoricalImportPage = lazy(() => import("./pages/HistoricalImportPage"));
const CrmPipelinePage = lazy(() => import("./pages/CrmPipelinePage"));
const MyDashboardPage = lazy(() => import("./pages/MyDashboardPage"));
const ManualPage = lazy(() => import("./pages/ManualPage"));
const CrmPermissionsPage = lazy(() => import("./pages/CrmPermissionsPage"));
const TasksAgendaPage = lazy(() => import("./pages/TasksAgendaPage"));
const ProdutosNegociacaoPage = lazy(() => import("./pages/ProdutosNegociacaoPage"));
const RdStationPage = lazy(() => import("./pages/RdStationPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 1000 * 60 * 5,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15000),
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center animate-pulse">
        <span className="text-primary font-bold text-sm">L</span>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3 animate-pulse">
            <span className="text-primary-foreground font-bold font-display">L</span>
          </div>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (window.location.pathname === "/reset-password") {
      return <ResetPasswordPage />;
    }
    return <AuthPage />;
  }

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
            <Route path="/meu-perfil" element={<ProfilePage />} />
            <Route path="/manual" element={<ManualPage />} />
            <Route path="/crm-permissions" element={<CrmPermissionsPage />} />
            <Route path="/tarefas" element={<TasksAgendaPage />} />
            <Route path="/produtos-negociacao" element={<ProdutosNegociacaoPage />} />
            <Route path="/integracoes/rd-station" element={<RdStationPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppLayout>
      <LaivinhaChat />
    </CrmPermissionsProvider>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter basename={import.meta.env.VITE_BASE_PATH || "/"}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
