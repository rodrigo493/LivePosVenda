import React, { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import {
  LayoutDashboard,
  HeadphonesIcon,
  ShieldCheck,
  Clock,
  CheckCircle,
  Package,
  DollarSign,
  TrendingUp,
  Users,
  ChevronDown,
  X,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiDrilldownDialog, DrilldownItem } from "@/components/dashboard/KpiDrilldownDialog";
import { OperationalAlerts } from "@/components/dashboard/OperationalAlerts";
import { ProblemRanking } from "@/components/dashboard/ProblemRanking";
import { DeviceFrequencyRanking } from "@/components/dashboard/DeviceFrequencyRanking";
import { AiOperationalSummary } from "@/components/dashboard/AiOperationalSummary";
import { AdminTeamOverview } from "@/components/dashboard/AdminTeamOverview";
import { PageHeader } from "@/components/layout/PageHeader";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useWarrantyClaims } from "@/hooks/useWarrantyAndService";
import { useEquipments } from "@/hooks/useEquipments";
import { useAllServiceHistory } from "@/hooks/useAllServiceHistory";
import { usePipelines } from "@/hooks/usePipelines";
import { useAdminTickets } from "@/hooks/useAdminTickets";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DASHBOARD_COLORS as COLORS } from "@/constants/colors";

// ─── User Multi-Select ────────────────────────────────────────────────────────

function UserMultiSelect({
  users,
  selectedIds,
  onChange,
}: {
  users: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = selectedIds.length === 0;

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Users className="h-3.5 w-3.5" />
          {allSelected
            ? "Todos os usuários"
            : `${selectedIds.length} usuário${selectedIds.length !== 1 ? "s" : ""}`}
          <ChevronDown className="h-3 w-3 opacity-50 ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2" sideOffset={4}>
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          <div
            className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted cursor-pointer select-none"
            onClick={() => onChange([])}
          >
            <Checkbox checked={allSelected} readOnly className="pointer-events-none" />
            <span className="text-sm font-medium">Todos</span>
          </div>
          <div className="h-px bg-border my-1" />
          {users.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1">Nenhum usuário encontrado</p>
          )}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted cursor-pointer select-none"
              onClick={() => toggle(u.id)}
            >
              <Checkbox checked={selectedIds.includes(u.id)} readOnly className="pointer-events-none" />
              <span className="text-sm truncate">{u.name}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Dashboard Content (todos os hooks de dados aqui) ────────────────────────

function DashboardContent() {
  const { data: allTickets } = useAdminTickets();
  const { data: pipelines } = usePipelines();
  const { data: orders } = useWorkOrders();
  const { data: claims } = useWarrantyClaims();
  const { data: equipments } = useEquipments();
  const { data: serviceHistory } = useAllServiceHistory();

  const { data: profiles } = useQuery({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name");
      return (data || []) as { user_id: string; full_name: string }[];
    },
    staleTime: 60_000,
  });

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("all");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [drilldown, setDrilldown] = useState<{ title: string; items: DrilldownItem[] } | null>(null);

  const hasFilter = selectedPipelineId !== "all" || selectedUserIds.length > 0;

  const handlePipelineChange = (pid: string) => {
    setSelectedPipelineId(pid);
    setSelectedUserIds([]);
  };

  // Usuários com chamados no fluxo selecionado
  const usersInPipeline = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; name: string }[] = [];
    (allTickets || [])
      .filter((t) => selectedPipelineId === "all" || t.pipeline_id === selectedPipelineId)
      .forEach((t) => {
        if (t.assigned_to && !seen.has(t.assigned_to)) {
          seen.add(t.assigned_to);
          const profile = profiles?.find((p) => p.user_id === t.assigned_to);
          result.push({ id: t.assigned_to, name: profile?.full_name || "Usuário" });
        }
      });
    return result.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [allTickets, selectedPipelineId, profiles]);

  // Tickets filtrados
  const filteredTickets = useMemo(
    () =>
      (allTickets || [])
        .filter((t) => selectedPipelineId === "all" || t.pipeline_id === selectedPipelineId)
        .filter((t) => selectedUserIds.length === 0 || selectedUserIds.includes(t.assigned_to || "")),
    [allTickets, selectedPipelineId, selectedUserIds]
  );

  const filteredTicketIds = useMemo(
    () => new Set(filteredTickets.map((t) => t.id)),
    [filteredTickets]
  );

  const filteredEquipmentIds = useMemo(
    () => new Set(filteredTickets.map((t) => t.equipment_id).filter(Boolean) as string[]),
    [filteredTickets]
  );

  const filteredClaims = useMemo(
    () => (claims || []).filter((c) => !hasFilter || filteredTicketIds.has(c.ticket_id)),
    [claims, filteredTicketIds, hasFilter]
  );

  const filteredOrders = useMemo(
    () =>
      (orders || []).filter(
        (o) => !hasFilter || (o.ticket_id != null && filteredTicketIds.has(o.ticket_id))
      ),
    [orders, filteredTicketIds, hasFilter]
  );

  const equipInWarrantyList = useMemo(
    () =>
      (equipments || []).filter(
        (e: any) =>
          e.warranty_status === "em_garantia" &&
          (!hasFilter || filteredEquipmentIds.has(e.id))
      ),
    [equipments, filteredEquipmentIds, hasFilter]
  );

  // KPIs de chamados
  const openTicketsList = filteredTickets.filter((t) => t.status === "aberto");
  const inProgressList = filteredTickets.filter((t) =>
    ["em_atendimento", "em_analise", "agendado"].includes(t.status)
  );
  const resolvedList = filteredTickets.filter((t) =>
    ["resolvido", "fechado"].includes(t.status)
  );

  // KPIs de garantia
  const warrantyInAnalysisList = filteredClaims.filter((c) => c.warranty_status === "em_analise");
  const approvedClaimsList = filteredClaims.filter((c) => c.warranty_status === "aprovada");
  const rejectedClaimsList = filteredClaims.filter((c) => c.warranty_status === "reprovada");
  const totalInternalCost = filteredClaims.reduce(
    (sum, c) => sum + Number(c.internal_cost || 0),
    0
  );

  const hasPieData =
    warrantyInAnalysisList.length > 0 ||
    approvedClaimsList.length > 0 ||
    rejectedClaimsList.length > 0;

  const pieData = [
    { name: "Em análise", value: warrantyInAnalysisList.length },
    { name: "Aprovadas", value: approvedClaimsList.length },
    { name: "Reprovadas", value: rejectedClaimsList.length },
  ].filter((d) => d.value > 0);

  const openDrilldown = (title: string, items: DrilldownItem[]) =>
    setDrilldown({ title, items });

  const ticketToDrilldown = (t: any): DrilldownItem => ({
    id: t.id,
    type: "ticket",
    title: `${t.ticket_number} — ${t.title}`,
    subtitle: t.clients?.name || "—",
    status: t.priority,
    extra: t.status,
    raw: t,
  });

  const claimToDrilldown = (c: any, label: string): DrilldownItem => ({
    id: c.ticket_id,
    type: "warranty",
    title: `Garantia — ${c.defect_description?.slice(0, 60) || "Sem descrição"}`,
    subtitle: `Custo: R$ ${Number(c.internal_cost || 0).toFixed(0)}`,
    status: c.warranty_status,
    extra: label,
    raw: null,
  });

  const orderToDrilldown = (o: any): DrilldownItem => ({
    id: o.id,
    type: "work_order",
    title: `${o.order_number} — ${o.order_type}`,
    subtitle: o.clients?.name || "—",
    status: o.status,
  });

  const equipToDrilldown = (e: any): DrilldownItem => ({
    id: e.id,
    type: "equipment",
    title: e.serial_number,
    subtitle: e.equipment_models?.name || "—",
    status: e.warranty_status,
  });

  const selectedPipeline = pipelines?.find((p) => p.id === selectedPipelineId);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <PageHeader
          title="Dashboard"
          description={
            selectedPipeline
              ? `Fluxo: ${selectedPipeline.name}`
              : "Visão geral da operação Live Care"
          }
          icon={LayoutDashboard}
        />
      </div>

      {/* Filtros: Fluxo + Usuário */}
      <div className="flex flex-wrap items-center gap-2 mb-6 p-3 bg-muted/40 rounded-xl border">
        <div className="flex flex-wrap gap-1.5 flex-1">
          <button
            onClick={() => handlePipelineChange("all")}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              selectedPipelineId === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-background border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            Todos os fluxos
          </button>
          {(pipelines || []).map((p) => (
            <button
              key={p.id}
              onClick={() => handlePipelineChange(p.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedPipelineId === p.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <UserMultiSelect
          users={usersInPipeline}
          selectedIds={selectedUserIds}
          onChange={setSelectedUserIds}
        />

        {selectedUserIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedUserIds.map((uid) => {
              const name = profiles?.find((p) => p.user_id === uid)?.full_name || "Usuário";
              return (
                <Badge
                  key={uid}
                  variant="secondary"
                  className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-destructive/10"
                  onClick={() =>
                    setSelectedUserIds((ids) => ids.filter((x) => x !== uid))
                  }
                >
                  {name}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Resumo por funil — visível quando "todos os fluxos" e há mais de 1 funil */}
      {selectedPipelineId === "all" && (pipelines || []).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {(pipelines || []).map((p) => {
            const pTickets = (allTickets || []).filter(
              (t) =>
                t.pipeline_id === p.id &&
                (selectedUserIds.length === 0 || selectedUserIds.includes(t.assigned_to || ""))
            );
            const pOpen = pTickets.filter((t) => t.status === "aberto").length;
            const pInProgress = pTickets.filter((t) =>
              ["em_atendimento", "em_analise", "agendado"].includes(t.status)
            ).length;
            const pResolved = pTickets.filter((t) =>
              ["resolvido", "fechado"].includes(t.status)
            ).length;
            return (
              <button
                key={p.id}
                onClick={() => handlePipelineChange(p.id)}
                className="bg-card border rounded-xl p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all text-left group"
              >
                <p className="text-[11px] font-semibold text-muted-foreground mb-3 truncate group-hover:text-primary transition-colors">
                  {p.name}
                </p>
                <div className="flex gap-4">
                  <div>
                    <p className="text-2xl font-bold text-primary leading-none">{pOpen}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Abertos</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-500 leading-none">{pInProgress}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Em andamento</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 leading-none">{pResolved}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Resolvidos</p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2.5 border-t pt-2">
                  {pTickets.length} chamado{pTickets.length !== 1 ? "s" : ""} no total
                </p>
              </button>
            );
          })}
        </div>
      )}

      <AdminTeamOverview />
      <OperationalAlerts />

      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard
          title="Chamados Abertos"
          value={openTicketsList.length}
          icon={HeadphonesIcon}
          variant="primary"
          onClick={() =>
            openDrilldown("Chamados Abertos", openTicketsList.map(ticketToDrilldown))
          }
        />
        <KpiCard
          title="Garantias em Análise"
          value={warrantyInAnalysisList.length}
          icon={ShieldCheck}
          variant="warning"
          onClick={() =>
            openDrilldown(
              "Garantias em Análise",
              warrantyInAnalysisList.map((c) => claimToDrilldown(c, "em_analise"))
            )
          }
        />
        <KpiCard
          title="Em Andamento"
          value={inProgressList.length}
          icon={Clock}
          onClick={() =>
            openDrilldown("Chamados Em Andamento", inProgressList.map(ticketToDrilldown))
          }
        />
        <KpiCard
          title="Resolvidos"
          value={resolvedList.length}
          icon={CheckCircle}
          variant="success"
          onClick={() =>
            openDrilldown("Chamados Resolvidos", resolvedList.map(ticketToDrilldown))
          }
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total Chamados"
          value={filteredTickets.length}
          icon={HeadphonesIcon}
          onClick={() =>
            openDrilldown("Todos os Chamados", filteredTickets.map(ticketToDrilldown))
          }
        />
        <KpiCard
          title="Ordens de Serviço"
          value={filteredOrders.length}
          icon={Package}
          onClick={() =>
            openDrilldown("Ordens de Serviço", filteredOrders.map(orderToDrilldown))
          }
        />
        <KpiCard
          title="Custo Garantia"
          value={`R$ ${totalInternalCost.toFixed(0)}`}
          icon={DollarSign}
          onClick={() =>
            openDrilldown(
              "Garantias (Custo)",
              filteredClaims
                .filter((c) => Number(c.internal_cost || 0) > 0)
                .map((c) => claimToDrilldown(c, "custo"))
            )
          }
        />
        <KpiCard
          title="Equip. em Garantia"
          value={equipInWarrantyList.length}
          icon={TrendingUp}
          onClick={() =>
            openDrilldown(
              "Equipamentos em Garantia",
              equipInWarrantyList.map(equipToDrilldown)
            )
          }
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border shadow-card p-6"
        >
          <h3 className="font-display font-semibold text-sm mb-4">Garantias: Status</h3>
          {hasPieData ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    paddingAngle={3}
                  >
                    {pieData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          COLORS[entry.name === "Em análise" ? 0 : entry.name === "Aprovadas" ? 1 : 2]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {pieData.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (entry.name === "Em análise")
                        openDrilldown(
                          "Garantias Em Análise",
                          warrantyInAnalysisList.map((c) => claimToDrilldown(c, "em_analise"))
                        );
                      else if (entry.name === "Aprovadas")
                        openDrilldown(
                          "Garantias Aprovadas",
                          approvedClaimsList.map((c) => claimToDrilldown(c, "aprovada"))
                        );
                      else
                        openDrilldown(
                          "Garantias Reprovadas",
                          rejectedClaimsList.map((c) => claimToDrilldown(c, "reprovada"))
                        );
                    }}
                    className="flex items-center gap-1.5 text-xs hover:underline cursor-pointer"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          COLORS[entry.name === "Em análise" ? 0 : entry.name === "Aprovadas" ? 1 : 2],
                      }}
                    />
                    {entry.name} ({entry.value})
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-16">
              {hasFilter
                ? "Nenhuma garantia para o filtro selecionado."
                : "Nenhuma garantia registrada ainda."}
            </p>
          )}
        </motion.div>

        <ProblemRanking />
      </div>

      {/* Device Frequency */}
      <div className="mb-6">
        <DeviceFrequencyRanking history={serviceHistory || []} />
      </div>

      {/* IA */}
      <div className="mb-6">
        <AiOperationalSummary />
      </div>

      <KpiDrilldownDialog
        open={!!drilldown}
        onOpenChange={(v) => {
          if (!v) setDrilldown(null);
        }}
        title={drilldown?.title || ""}
        items={drilldown?.items || []}
      />
    </div>
  );
}

// ─── Dashboard (guard de acesso) ─────────────────────────────────────────────

const Dashboard = () => {
  const { roles, rolesLoading, hasRole } = useAuth();

  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center animate-pulse">
          <span className="text-primary font-bold text-sm">L</span>
        </div>
      </div>
    );
  }

  if (!hasRole("admin")) {
    return <Navigate to="/meu-painel" replace />;
  }

  return <DashboardContent />;
};

export default Dashboard;
