import { DASHBOARD_QUERY_LIMIT, DELAYED_LIST_LIMIT, COMPACT_LIST_LIMIT, CARD_LIST_LIMIT } from "@/constants/limits";
import { useMemo, useState, useCallback } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import { toast } from "sonner";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { DEFAULT_LAYOUT, LayoutItem } from "@/constants/dashboardLayout";

const AutoWidthGridLayout = WidthProvider(GridLayout);
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, AlertTriangle, CheckCircle, Clock, ListTodo, Package,
  PhoneCall, TrendingUp, Receipt, Wrench, Shield, ClipboardList, Ticket,
  X, DollarSign, Edit2, Save, RotateCcw, CalendarClock, ListChecks, PhoneOff,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { DailyPriorities } from "@/components/dashboard/DailyPriorities";
import { TicketDetailDialog } from "@/components/tickets/TicketDetailDialog";
const PIPELINE_STAGES_FALLBACK = [
  { key: "sem_atendimento", label: "Sem atendimento", color: "#6366f1" },
  { key: "primeiro_contato", label: "Primeiro contato", color: "#f59e0b" },
  { key: "em_analise", label: "Em análise", color: "#3b82f6" },
  { key: "separacao_pecas", label: "Separação de peças", color: "#8b5cf6" },
  { key: "concluido", label: "Concluído", color: "#10b981" },
];
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { formatDate as fmtDate, formatCurrencyCompact as fmtCurrency } from "@/lib/formatters";

function daysSince(dateStr: string | null) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function useAllTickets() {
  return useQuery({
    queryKey: ["all-tickets-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name))")
        .not("status", "eq", "fechado")
        .order("last_interaction_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

function useAllQuotes() {
  return useQuery({
    queryKey: ["all-quotes-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*, clients(name)").order("created_at", { ascending: false }).limit(DASHBOARD_QUERY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

function useAllWorkOrders() {
  return useQuery({
    queryKey: ["all-work-orders-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_orders").select("*, clients(name)").order("created_at", { ascending: false }).limit(DASHBOARD_QUERY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

function useAllWarrantyClaims() {
  return useQuery({
    queryKey: ["all-warranty-claims-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("warranty_claims").select("*, tickets(id, ticket_number, title, client_id, clients(name))").order("created_at", { ascending: false }).limit(DASHBOARD_QUERY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

function useAllServiceRequests() {
  return useQuery({
    queryKey: ["all-service-requests-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_requests").select("*, tickets(id, ticket_number, title, client_id, clients(name))").order("created_at", { ascending: false }).limit(DASHBOARD_QUERY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

function useWarrantyCostOrders() {
  return useQuery({
    queryKey: ["warranty-cost-orders-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, order_number, ticket_id, clients(name), work_order_items(item_type, quantity, unit_cost)")
        .eq("order_type", "garantia");
      if (error) throw error;
      return data;
    },
  });
}

function useAllTasks() {
  return useQuery({
    queryKey: ["all-tasks-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, tickets(ticket_number, title), clients(name)")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}

type DrillDownKey =
  | "active" | "concluded" | "delayed" | "noContact" | "awaitingParts"
  | "pendingQuotes" | "openWOs" | "completedWOs" | "pendingWarranties" | "openSR"
  | "warrantyCost"
  | "dp-delayed" | "dp-overdue-tasks" | "dp-today-tasks" | "dp-no-contact" | "dp-stale"
  | null;

const DRILL_LABELS: Record<string, string> = {
  active: "Tickets Ativos",
  concluded: "Concluídos",
  delayed: "Atrasados",
  noContact: "Sem atendimento",
  awaitingParts: "Aguardando peça",
  pendingQuotes: "Orçamentos pendentes",
  openWOs: "OS Abertas",
  completedWOs: "OS Concluídas",
  pendingWarranties: "Garantias em análise",
  openSR: "Assistências abertas",
  warrantyCost: "Custo de Garantias — detalhamento por OS",
  "dp-delayed": "Clientes atrasados",
  "dp-overdue-tasks": "Tarefas vencidas",
  "dp-today-tasks": "Tarefas para hoje",
  "dp-no-contact": "Sem primeiro contato",
  "dp-stale": "Sem interação >2 dias",
};

const MyDashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: tickets } = useAllTickets();
  const { data: tasks } = useAllTasks();
  const { data: quotes } = useAllQuotes();
  const { data: workOrders } = useAllWorkOrders();
  const { data: warrantyClaims } = useAllWarrantyClaims();
  const { data: serviceRequests } = useAllServiceRequests();
  const { data: warrantyCostOrders } = useWarrantyCostOrders();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["all-tickets-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["all-tasks-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["all-quotes-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["all-work-orders-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["all-warranty-claims-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["all-service-requests-dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["warranty-cost-orders-dashboard"] });
    setIsRefreshing(false);
    toast.success("Dados atualizados");
  }, [queryClient]);

  const [drillDown, setDrillDown] = useState<DrillDownKey>(null);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);

  // ── Layout editor ──────────────────────────────────────────────
  const { currentLayout, saveLayout, resetLayout, isSaving, isResetting } =
    useDashboardLayout();
  const [isEditing, setIsEditing] = useState(false);
  const [draftLayout, setDraftLayout] = useState<LayoutItem[]>([]);
  const [preEditLayout, setPreEditLayout] = useState<LayoutItem[]>([]);

  const enterEdit = useCallback(() => {
    setPreEditLayout(currentLayout);
    setDraftLayout(currentLayout);
    setIsEditing(true);
  }, [currentLayout]);

  const cancelEdit = useCallback(() => {
    setDraftLayout(preEditLayout);
    setIsEditing(false);
  }, [preEditLayout]);

  const handleSave = useCallback(async () => {
    try {
      await saveLayout(draftLayout);
      toast.success("Layout salvo com sucesso");
    } catch {
      toast.error("Erro ao salvar layout");
    }
    setIsEditing(false);
  }, [draftLayout, saveLayout]);

  const handleReset = useCallback(async () => {
    try {
      await resetLayout();
      setDraftLayout(DEFAULT_LAYOUT);
      toast.success("Layout resetado para o padrão");
    } catch {
      toast.error("Erro ao resetar layout");
    }
    setIsEditing(false);
  }, [resetLayout]);

  const activeLayout = isEditing ? draftLayout : currentLayout;
  // ────────────────────────────────────────────────────────────────

  const findTicket = (id: string) => (tickets || []).find((t: any) => t.id === id) || null;
  const openTicket = (id: string | null) => { if (id) setSelectedTicket(findTicket(id)); };

  const today = new Date().toISOString().slice(0, 10);
  const userName = user?.user_metadata?.full_name?.split(" ")[0];

  const stats = useMemo(() => {
    const all = tickets || [];
    const delayed = all.filter((t: any) => daysSince(t.last_interaction_at) >= 2 && t.pipeline_stage !== "concluido");
    const concluded = all.filter((t: any) => t.pipeline_stage === "concluido");
    const active = all.filter((t: any) => t.pipeline_stage !== "concluido");
    const awaitingParts = all.filter((t: any) => t.pipeline_stage === "separacao_pecas");
    const noContact = all.filter((t: any) => t.pipeline_stage === "sem_atendimento");

    const allTasks = tasks || [];
    const pendingTasks = allTasks.filter((t: any) => t.status === "pendente" || t.status === "em_andamento");
    const todayTasks = allTasks.filter((t: any) => t.due_date === today && t.status !== "concluida");
    const overdueTasks = allTasks.filter((t: any) => t.due_date && t.due_date < today && t.status !== "concluida");

    const avgDays = active.length > 0
      ? Math.round(active.reduce((s: number, t: any) => s + Math.min(daysSince(t.last_interaction_at), 365), 0) / active.length)
      : 0;

    const allQuotes = quotes || [];
    const pendingQuotes = allQuotes.filter((q: any) => q.status === "rascunho" || q.status === "aguardando_aprovacao");
    const approvedQuotes = allQuotes.filter((q: any) => q.status === "aprovado" || q.status === "convertido_os");
    const totalQuoteValue = allQuotes.reduce((s: number, q: any) => s + Number(q.total || 0), 0);

    const allWOs = workOrders || [];
    const openWOs = allWOs.filter((wo: any) => wo.status === "aberta" || wo.status === "agendada" || wo.status === "em_andamento");
    const completedWOs = allWOs.filter((wo: any) => wo.status === "concluida");

    const allWarranties = warrantyClaims || [];
    const pendingWarranties = allWarranties.filter((w: any) => w.warranty_status === "em_analise");

    const allSR = serviceRequests || [];
    const openSR = allSR.filter((sr: any) => sr.status === "aberto" || sr.status === "em_andamento");

    const stale = delayed.filter((t: any) => t.pipeline_stage !== "sem_atendimento");

    return {
      all, delayed, concluded, active, awaitingParts, noContact, stale,
      pendingTasks, todayTasks, overdueTasks, avgDays,
      allQuotes, pendingQuotes, approvedQuotes, totalQuoteValue,
      allWOs, openWOs, completedWOs,
      allWarranties, pendingWarranties,
      allSR, openSR,
    };
  }, [tickets, tasks, today, quotes, workOrders, warrantyClaims, serviceRequests]);

  const warrantyCosts = useMemo(() => {
    const wos = warrantyCostOrders || [];
    let pecas = 0, maoObra = 0, frete = 0;
    wos.forEach((wo: any) => {
      (wo.work_order_items || []).forEach((item: any) => {
        const v = Number(item.quantity) * Number(item.unit_cost);
        if (item.item_type === "peca_garantia" || item.item_type === "peca_cobrada") pecas += v;
        else if (item.item_type === "servico_garantia" || item.item_type === "servico_cobrado") maoObra += v;
        else if (item.item_type === "frete") frete += v;
      });
    });
    return { pecas, maoObra, frete, total: pecas + maoObra + frete };
  }, [warrantyCostOrders]);

  const toggleDrill = (key: DrillDownKey) => setDrillDown(prev => prev === key ? null : key);

  // Get drill-down items — normalize to { id, ticketId, clientName, title, subtitle, status }
  const drillItems = useMemo(() => {
    if (!drillDown) return [];

    // Ticket-based drills
    const ticketKeys = ["active", "concluded", "delayed", "noContact", "awaitingParts"];
    if (ticketKeys.includes(drillDown)) {
      const list = (stats as any)[drillDown] || [];
      return list.map((t: any) => ({
        id: t.id,
        ticketId: t.id,
        clientName: t.clients?.name || "—",
        title: t.title,
        subtitle: `${t.ticket_number} · ${t.pipeline_stage}`,
        status: t.status,
        extra: drillDown === "delayed" ? `${daysSince(t.last_interaction_at)}d sem interação` : undefined,
      }));
    }

    if (drillDown === "pendingQuotes") {
      return stats.pendingQuotes.map((q: any) => ({
        id: q.id,
        ticketId: q.ticket_id,
        clientName: q.clients?.name || "—",
        title: q.quote_number,
        subtitle: fmtCurrency(q.total),
        status: q.status,
      }));
    }

    if (drillDown === "openWOs" || drillDown === "completedWOs") {
      const list = drillDown === "openWOs" ? stats.openWOs : stats.completedWOs;
      return list.map((wo: any) => ({
        id: wo.id,
        ticketId: wo.ticket_id,
        clientName: wo.clients?.name || "—",
        title: wo.order_number,
        subtitle: wo.diagnosis || wo.order_type,
        status: wo.status,
      }));
    }

    if (drillDown === "pendingWarranties") {
      return stats.pendingWarranties.map((w: any) => ({
        id: w.id,
        ticketId: w.tickets?.id,
        clientName: w.tickets?.clients?.name || "—",
        title: w.tickets?.title || "Garantia",
        subtitle: w.tickets?.ticket_number || "",
        status: w.warranty_status,
      }));
    }

    if (drillDown === "openSR") {
      return stats.openSR.map((sr: any) => ({
        id: sr.id,
        ticketId: sr.tickets?.id,
        clientName: sr.tickets?.clients?.name || "—",
        title: sr.tickets?.title || "Assistência",
        subtitle: `${sr.request_type} · ${sr.tickets?.ticket_number}`,
        status: sr.status,
      }));
    }

    if (drillDown === "warrantyCost") {
      const wos = warrantyCostOrders || [];
      return wos
        .map((wo: any) => {
          const items = wo.work_order_items || [];
          const total = items.reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.unit_cost), 0);
          return {
            id: wo.id,
            ticketId: wo.ticket_id,
            clientName: wo.clients?.name || "—",
            title: wo.order_number,
            subtitle: fmtCurrency(total),
            status: "garantia",
            _cost: total,
          };
        })
        .filter((wo: any) => wo._cost > 0)
        .sort((a: any, b: any) => b._cost - a._cost);
    }

    if (drillDown === "dp-delayed") {
      return stats.delayed.map((t: any) => ({
        id: t.id, ticketId: t.id, clientName: t.clients?.name || "—",
        title: t.title, subtitle: `${t.ticket_number} · ${t.pipeline_stage}`,
        status: t.status, extra: `${daysSince(t.last_interaction_at)}d sem interação`,
      }));
    }
    if (drillDown === "dp-overdue-tasks") {
      return stats.overdueTasks.map((t: any) => ({
        id: t.id, ticketId: t.ticket_id, clientName: t.clients?.name || "—",
        title: t.title, subtitle: `Vence: ${t.due_date}`, status: t.status,
      }));
    }
    if (drillDown === "dp-today-tasks") {
      return stats.todayTasks.map((t: any) => ({
        id: t.id, ticketId: t.ticket_id, clientName: t.clients?.name || "—",
        title: t.title, subtitle: `Hoje: ${t.due_date}`, status: t.status,
      }));
    }
    if (drillDown === "dp-no-contact") {
      return stats.noContact.map((t: any) => ({
        id: t.id, ticketId: t.id, clientName: t.clients?.name || "—",
        title: t.title, subtitle: `${t.ticket_number} · ${t.pipeline_stage}`,
        status: t.status,
      }));
    }
    if (drillDown === "dp-stale") {
      return stats.stale.map((t: any) => ({
        id: t.id, ticketId: t.id, clientName: t.clients?.name || "—",
        title: t.title, subtitle: `${t.ticket_number} · ${t.pipeline_stage}`,
        status: t.status, extra: `${daysSince(t.last_interaction_at)}d sem interação`,
      }));
    }

    return [];
  }, [drillDown, stats, warrantyCostOrders]);

  return (
    <div>
      <PageHeader title="Meu Painel" description="Visão operacional completa do sistema" icon={LayoutDashboard} />

      <DailyPriorities tickets={stats.all} tasks={tasks || []} today={today} userName={userName} hideBlocks />

      {/* ── Botões do modo de edição ── */}
      <div className="flex items-center justify-end gap-2 mb-3">
        {isEditing ? (
          <>
            <span className="text-xs text-muted-foreground mr-auto flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5">
              <Edit2 className="h-3 w-3 text-primary" />
              Arraste para reposicionar · Puxe o canto ↘ para redimensionar
            </span>
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Resetar padrão
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Save className="h-3 w-3" />
              {isSaving ? "Salvando…" : "Salvar"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Atualizando…" : "Atualizar"}
            </button>
            <button
              onClick={enterEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
            >
              <Edit2 className="h-3 w-3" />
              Editar layout
            </button>
          </>
        )}
      </div>

      {/* ── KPI Grid (react-grid-layout) ── */}
      <div className="mb-4">
        <AutoWidthGridLayout
          layout={activeLayout}
          cols={12}
          rowHeight={88}
          isDraggable={isEditing}
          isResizable={isEditing}
          draggableHandle=".drag-handle"
          onLayoutChange={(layout) => {
            if (isEditing) setDraftLayout(layout as LayoutItem[]);
          }}
          margin={[12, 12]}
          containerPadding={[0, 0]}
        >
          {/* dp-delayed */}
          <div key="dp-delayed" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "dp-delayed" ? "ring-destructive" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("dp-delayed")}>
              <KpiCard title="Clientes atrasados" value={stats.delayed.length} icon={AlertTriangle} variant="warning" />
            </div>
          </div>

          {/* dp-overdue-tasks */}
          <div key="dp-overdue-tasks" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "dp-overdue-tasks" ? "ring-destructive" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("dp-overdue-tasks")}>
              <KpiCard title="Tarefas vencidas" value={stats.overdueTasks.length} icon={CalendarClock} variant="warning" />
            </div>
          </div>

          {/* dp-today-tasks */}
          <div key="dp-today-tasks" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "dp-today-tasks" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("dp-today-tasks")}>
              <KpiCard title="Tarefas para hoje" value={stats.todayTasks.length} icon={ListChecks} variant="primary" />
            </div>
          </div>

          {/* dp-no-contact */}
          <div key="dp-no-contact" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "dp-no-contact" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("dp-no-contact")}>
              <KpiCard title="Sem primeiro contato" value={stats.noContact.length} icon={PhoneOff} variant="warning" />
            </div>
          </div>

          {/* dp-stale */}
          <div key="dp-stale" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "dp-stale" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("dp-stale")}>
              <KpiCard title="Sem interação >2d" value={stats.stale.length} icon={Clock} variant="warning" />
            </div>
          </div>

          {/* tickets-ativos */}
          <div key="tickets-ativos" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "active" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("active")}>
              <KpiCard title="Tickets Ativos" value={stats.active.length} icon={Ticket} variant="primary" />
            </div>
          </div>

          {/* concluidos */}
          <div key="concluidos" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "concluded" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("concluded")}>
              <KpiCard title="Concluídos" value={stats.concluded.length} icon={CheckCircle} variant="success" />
            </div>
          </div>

          {/* atrasados */}
          <div key="atrasados" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "delayed" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("delayed")}>
              <KpiCard title="Atrasados" value={stats.delayed.length} icon={AlertTriangle} variant="warning" />
            </div>
          </div>

          {/* media-interacao */}
          <div key="media-interacao" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className="kpi-click-layer h-full rounded-xl">
              <KpiCard title="Média s/ interação" value={`${stats.avgDays}d`} icon={TrendingUp} />
            </div>
          </div>

          {/* sem-atendimento */}
          <div key="sem-atendimento" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "noContact" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("noContact")}>
              <KpiCard title="Sem atendimento" value={stats.noContact.length} icon={PhoneCall} variant="warning" />
            </div>
          </div>

          {/* aguardando-peca */}
          <div key="aguardando-peca" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "awaitingParts" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("awaitingParts")}>
              <KpiCard title="Aguardando peça" value={stats.awaitingParts.length} icon={Package} />
            </div>
          </div>

          {/* orcamentos-pendentes */}
          <div key="orcamentos-pendentes" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "pendingQuotes" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("pendingQuotes")}>
              <KpiCard title="Orçamentos pendentes" value={stats.pendingQuotes.length} icon={Receipt} />
            </div>
          </div>

          {/* os-abertas */}
          <div key="os-abertas" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "openWOs" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("openWOs")}>
              <KpiCard title="OS Abertas" value={stats.openWOs.length} icon={Wrench} variant="primary" />
            </div>
          </div>

          {/* os-concluidas */}
          <div key="os-concluidas" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "completedWOs" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("completedWOs")}>
              <KpiCard title="OS Concluídas" value={stats.completedWOs.length} icon={CheckCircle} variant="success" />
            </div>
          </div>

          {/* garantias-analise */}
          <div key="garantias-analise" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "pendingWarranties" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("pendingWarranties")}>
              <KpiCard title="Garantias em análise" value={stats.pendingWarranties.length} icon={Shield} variant="warning" />
            </div>
          </div>

          {/* assistencias-abertas */}
          <div key="assistencias-abertas" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "openSR" ? "ring-primary" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("openSR")}>
              <KpiCard title="Assistências abertas" value={stats.openSR.length} icon={ClipboardList} />
            </div>
          </div>

          {/* custo-garantia */}
          <div key="custo-garantia" className={isEditing ? "rgl-edit-item" : ""} style={{ position: "relative" }}>
            {isEditing && <span className="drag-handle">⠿⠿</span>}
            <div className={`kpi-click-layer h-full cursor-pointer rounded-xl ring-2 transition-all ${drillDown === "warrantyCost" ? "ring-destructive" : "ring-transparent"}`}
              onClick={() => !isEditing && toggleDrill("warrantyCost")}>
              <KpiCard title="Custo Garantia" value={fmtCurrency(warrantyCosts.total)} icon={DollarSign} variant="warning" />
            </div>
          </div>
        </AutoWidthGridLayout>
      </div>

      {/* Drill-down panel */}
      <AnimatePresence>
        {drillDown && (
          <motion.div
            key="drilldown"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="bg-card rounded-xl border shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  {DRILL_LABELS[drillDown] || drillDown}
                  <Badge variant="secondary" className="text-[10px]">{drillItems.length}</Badge>
                </h3>
                <button onClick={() => setDrillDown(null)} className="p-1 rounded-md hover:bg-muted transition-colors">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {drillDown === "warrantyCost" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 rounded-lg bg-muted/40 border">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Peças</p>
                    <p className="text-sm font-semibold text-orange-500">{fmtCurrency(warrantyCosts.pecas)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Mão de obra</p>
                    <p className="text-sm font-semibold text-blue-500">{fmtCurrency(warrantyCosts.maoObra)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Frete</p>
                    <p className="text-sm font-semibold text-purple-500">{fmtCurrency(warrantyCosts.frete)}</p>
                  </div>
                  <div className="text-center border-l">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Total geral</p>
                    <p className="text-sm font-bold">{fmtCurrency(warrantyCosts.total)}</p>
                  </div>
                </div>
              )}

              {drillItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhum item nesta categoria</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[400px] overflow-y-auto">
                  {drillItems.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border cursor-pointer hover:bg-muted/60 hover:border-primary/30 transition-all group"
                      onClick={() => {
                        if (item.ticketId) {
                          openTicket(item.ticketId);
                        }
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{item.clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground">{item.subtitle}</p>
                        {item.extra && (
                          <p className="text-[10px] text-destructive font-medium mt-0.5">{item.extra}</p>
                        )}
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Pipeline summary */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-sm">Pipeline CRM</h3>
            <Badge variant="secondary" className="text-[10px]">{stats.all.length} total</Badge>
          </div>
          <div className="space-y-2.5">
            {PIPELINE_STAGES_FALLBACK.map((stage) => {
              const items = (tickets || []).filter((t: any) => t.pipeline_stage === stage.key);
              const count = items.length;
              const pct = stats.all.length > 0 ? Math.round((count / stats.all.length) * 100) : 0;
              return (
                <div key={stage.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-xs">{stage.label}</span>
                    </div>
                    <span className="text-xs font-semibold">{count}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stage.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Delayed clients */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border shadow-card p-5">
          <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Clientes atrasados
            <Badge variant="destructive" className="text-[10px] h-4 ml-auto">{stats.delayed.length}</Badge>
          </h3>
          {stats.delayed.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum atraso 🎉</p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {stats.delayed.slice(0, DELAYED_LIST_LIMIT).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 cursor-pointer hover:bg-destructive/10 transition-colors" onClick={() => setSelectedTicket(t)}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.clients?.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">{t.ticket_number} · {t.pipeline_stage}</p>
                  </div>
                  <Badge variant="destructive" className="text-[9px] h-4 shrink-0 ml-2">
                    {daysSince(t.last_interaction_at)}d
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Tasks */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-card p-5">
          <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1.5">
            <ListTodo className="h-3.5 w-3.5 text-primary" /> Tarefas do dia
          </h3>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-xs">
              <span>Vencendo hoje</span>
              <Badge variant={stats.todayTasks.length > 0 ? "default" : "secondary"} className="text-[10px] h-4">{stats.todayTasks.length}</Badge>
            </div>
            <div className="flex justify-between text-xs">
              <span>Atrasadas</span>
              <Badge variant={stats.overdueTasks.length > 0 ? "destructive" : "secondary"} className="text-[10px] h-4">{stats.overdueTasks.length}</Badge>
            </div>
            <div className="flex justify-between text-xs">
              <span>Pendentes</span>
              <Badge variant="secondary" className="text-[10px] h-4">{stats.pendingTasks.length}</Badge>
            </div>
          </div>
          {(stats.overdueTasks.length > 0 || stats.todayTasks.length > 0) && (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {[...stats.overdueTasks, ...stats.todayTasks].slice(0, COMPACT_LIST_LIMIT).map((t: any) => (
                <div key={t.id} className="text-xs p-2.5 rounded-lg bg-muted/50 border">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground">{t.clients?.name} · {t.due_date}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-1.5">
              <Receipt className="h-3.5 w-3.5 text-primary" /> Orçamentos
            </h3>
            <Badge variant="secondary" className="text-[10px]">{stats.allQuotes.length}</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Pendentes</span><span className="font-semibold">{stats.pendingQuotes.length}</span></div>
            <div className="flex justify-between text-xs"><span>Aprovados</span><span className="font-semibold text-emerald-600">{stats.approvedQuotes.length}</span></div>
            <div className="flex justify-between text-xs"><span>Valor total</span><span className="font-semibold">{fmtCurrency(stats.totalQuoteValue)}</span></div>
          </div>
          {stats.pendingQuotes.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto">
              {stats.pendingQuotes.slice(0, CARD_LIST_LIMIT).map((q: any) => (
                <div key={q.id} className="text-xs p-2 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted transition-colors" onClick={() => q.ticket_id && openTicket(q.ticket_id)}>
                  <div className="flex justify-between"><span className="font-mono font-medium">{q.quote_number}</span><StatusBadge status={q.status} /></div>
                  <span className="text-[10px] text-muted-foreground">{q.clients?.name} · {fmtCurrency(q.total)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-card rounded-xl border shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-primary" /> Ordens de Serviço</h3>
            <Badge variant="secondary" className="text-[10px]">{stats.allWOs.length}</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Abertas</span><span className="font-semibold">{stats.openWOs.length}</span></div>
            <div className="flex justify-between text-xs"><span>Concluídas</span><span className="font-semibold text-emerald-600">{stats.completedWOs.length}</span></div>
          </div>
          {stats.openWOs.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto">
              {stats.openWOs.slice(0, CARD_LIST_LIMIT).map((wo: any) => (
                <div key={wo.id} className="text-xs p-2 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted transition-colors" onClick={() => wo.ticket_id && openTicket(wo.ticket_id)}>
                  <div className="flex justify-between"><span className="font-mono font-medium">{wo.order_number}</span><StatusBadge status={wo.status} /></div>
                  <span className="text-[10px] text-muted-foreground">{wo.clients?.name}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-warning" /> Garantias</h3>
            <Badge variant="secondary" className="text-[10px]">{stats.allWarranties.length}</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Em análise</span><span className="font-semibold">{stats.pendingWarranties.length}</span></div>
            <div className="flex justify-between text-xs"><span>Total</span><span className="font-semibold">{stats.allWarranties.length}</span></div>
          </div>
          {stats.pendingWarranties.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto">
              {stats.pendingWarranties.slice(0, CARD_LIST_LIMIT).map((w: any) => (
                <div key={w.id} className="text-xs p-2 rounded-lg bg-warning/5 border border-warning/20 cursor-pointer hover:bg-warning/10 transition-colors" onClick={() => w.tickets?.id && openTicket(w.tickets.id)}>
                  <div className="flex justify-between"><span className="font-medium">{w.tickets?.clients?.name || "—"}</span><StatusBadge status={w.warranty_status} /></div>
                  <span className="text-[10px] text-muted-foreground">{w.tickets?.ticket_number}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-1.5"><ClipboardList className="h-3.5 w-3.5 text-primary" /> Assistências</h3>
            <Badge variant="secondary" className="text-[10px]">{stats.allSR.length}</Badge>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs"><span>Abertas</span><span className="font-semibold">{stats.openSR.length}</span></div>
            <div className="flex justify-between text-xs"><span>Total</span><span className="font-semibold">{stats.allSR.length}</span></div>
          </div>
          {stats.openSR.length > 0 && (
            <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto">
              {stats.openSR.slice(0, CARD_LIST_LIMIT).map((sr: any) => (
                <div key={sr.id} className="text-xs p-2 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted transition-colors" onClick={() => sr.tickets?.id && openTicket(sr.tickets.id)}>
                  <div className="flex justify-between"><span className="font-medium">{sr.tickets?.clients?.name || "—"}</span><StatusBadge status={sr.status} /></div>
                  <span className="text-[10px] text-muted-foreground">{sr.request_type} · {sr.tickets?.ticket_number}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Quick lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuickList
          title="Aguardando peça"
          icon={<Package className="h-3.5 w-3.5 text-primary" />}
          items={stats.awaitingParts}
          onClickItem={(id) => openTicket(id)}
        />
        <QuickList
          title="Sem atendimento"
          icon={<PhoneCall className="h-3.5 w-3.5 text-warning" />}
          items={stats.noContact}
          onClickItem={(id) => openTicket(id)}
        />
      </div>

      {/* Ticket detail dialog */}
      <TicketDetailDialog
        ticket={selectedTicket}
        open={!!selectedTicket}
        onOpenChange={(open) => { if (!open) setSelectedTicket(null); }}
      />
    </div>
  );
};

function QuickList({ title, icon, items, onClickItem }: { title: string; icon: React.ReactNode; items: any[]; onClickItem: (id: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-5">
      <h3 className="font-display font-semibold text-sm mb-3 flex items-center gap-1.5">{icon}{title}
        <Badge variant="secondary" className="text-[10px] h-4 ml-auto">{items.length}</Badge>
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum</p>
      ) : (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {items.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted transition-colors" onClick={() => onClickItem(t.id)}>
              <div className="min-w-0">
                <p className="font-medium truncate">{t.clients?.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t.title}</p>
                <p className="text-[10px] text-muted-foreground">{t.ticket_number}</p>
              </div>
              <StatusBadge status={t.priority} />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default MyDashboardPage;
