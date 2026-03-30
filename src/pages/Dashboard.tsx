import { useState, useMemo } from "react";
import {
  LayoutDashboard,
  HeadphonesIcon,
  ShieldCheck,
  Clock,
  CheckCircle,
  Package,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiDrilldownDialog, DrilldownItem } from "@/components/dashboard/KpiDrilldownDialog";
import { OperationalAlerts } from "@/components/dashboard/OperationalAlerts";
import { ProblemRanking } from "@/components/dashboard/ProblemRanking";
import { DeviceFrequencyRanking } from "@/components/dashboard/DeviceFrequencyRanking";
import { ProblemFrequencyRanking } from "@/components/dashboard/ProblemFrequencyRanking";

import { AiOperationalSummary } from "@/components/dashboard/AiOperationalSummary";
import { AdminTeamOverview } from "@/components/dashboard/AdminTeamOverview";
import { PageHeader } from "@/components/layout/PageHeader";

import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useTickets } from "@/hooks/useTickets";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useWarrantyClaims } from "@/hooks/useWarrantyAndService";
import { useEquipments } from "@/hooks/useEquipments";
import { useAllServiceHistory } from "@/hooks/useAllServiceHistory";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DASHBOARD_COLORS as COLORS } from "@/constants/colors";

function ticketToDrilldown(t: any): DrilldownItem {
  return {
    id: t.id,
    type: "ticket",
    title: `${t.ticket_number} — ${t.title}`,
    subtitle: t.clients?.name || "—",
    status: t.priority,
    extra: t.status,
    raw: t,
  };
}

const Dashboard = () => {
  const { roles } = useAuth();
  const { data: tickets } = useTickets();
  const { data: orders } = useWorkOrders();
  const { data: claims } = useWarrantyClaims();
  const { data: equipments } = useEquipments();
  const { data: serviceHistory } = useAllServiceHistory();

  const [drilldown, setDrilldown] = useState<{ title: string; items: DrilldownItem[] } | null>(null);

  // Filtered sets
  const openTicketsList = useMemo(() => tickets?.filter((t) => t.status === "aberto") || [], [tickets]);
  const inProgressList = useMemo(() => tickets?.filter((t) => ["em_atendimento", "em_analise", "agendado"].includes(t.status)) || [], [tickets]);
  const resolvedList = useMemo(() => tickets?.filter((t) => t.status === "resolvido" || t.status === "fechado") || [], [tickets]);
  
  const warrantyInAnalysisList = useMemo(() => claims?.filter((c) => c.warranty_status === "em_analise") || [], [claims]);
  const approvedClaimsList = useMemo(() => claims?.filter((c) => c.warranty_status === "aprovada") || [], [claims]);
  const rejectedClaimsList = useMemo(() => claims?.filter((c) => c.warranty_status === "reprovada") || [], [claims]);
  
  const totalInternalCost = claims?.reduce((sum, c) => sum + Number(c.internal_cost || 0), 0) || 0;
  const equipInWarrantyList = useMemo(() => equipments?.filter((e: any) => e.warranty_status === "em_garantia") || [], [equipments]);

  const hasPieData = warrantyInAnalysisList.length > 0 || approvedClaimsList.length > 0 || rejectedClaimsList.length > 0;
  const pieData = [
    { name: "Em análise", value: warrantyInAnalysisList.length },
    { name: "Aprovadas", value: approvedClaimsList.length },
    { name: "Reprovadas", value: rejectedClaimsList.length },
  ].filter((d) => d.value > 0);

  // Drill-down helpers
  const openDrilldown = (title: string, items: DrilldownItem[]) => setDrilldown({ title, items });

  const claimToDrilldown = (c: any, label: string): DrilldownItem => ({
    id: c.ticket_id,
    type: "warranty",
    title: `Garantia — ${c.defect_description?.slice(0, 60) || "Sem descrição"}`,
    subtitle: `Custo: R$ ${Number(c.internal_cost || 0).toFixed(0)}`,
    status: c.warranty_status,
    extra: label,
    raw: tickets?.find((t) => t.id === c.ticket_id),
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Dashboard" description="Visão geral da operação Live Care" icon={LayoutDashboard} />
      </div>

      {roles.includes("admin") && <AdminTeamOverview />}
      <OperationalAlerts />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Chamados Abertos" value={openTicketsList.length} icon={HeadphonesIcon} variant="primary"
          onClick={() => openDrilldown("Chamados Abertos", openTicketsList.map(ticketToDrilldown))}
        />
        <KpiCard
          title="Garantias em Análise" value={warrantyInAnalysisList.length} icon={ShieldCheck} variant="warning"
          onClick={() => openDrilldown("Garantias em Análise", warrantyInAnalysisList.map((c) => claimToDrilldown(c, "em_analise")))}
        />
        <KpiCard
          title="Em Andamento" value={inProgressList.length} icon={Clock}
          onClick={() => openDrilldown("Chamados Em Andamento", inProgressList.map(ticketToDrilldown))}
        />
        <KpiCard
          title="Resolvidos" value={resolvedList.length} icon={CheckCircle} variant="success"
          onClick={() => openDrilldown("Chamados Resolvidos", resolvedList.map(ticketToDrilldown))}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          title="Total Chamados" value={tickets?.length || 0} icon={HeadphonesIcon}
          onClick={() => openDrilldown("Todos os Chamados", (tickets || []).map(ticketToDrilldown))}
        />
        <KpiCard
          title="Ordens de Serviço" value={orders?.length || 0} icon={Package}
          onClick={() => openDrilldown("Ordens de Serviço", (orders || []).map(orderToDrilldown))}
        />
        <KpiCard
          title="Custo Garantia" value={`R$ ${totalInternalCost.toFixed(0)}`} icon={DollarSign}
          onClick={() => openDrilldown("Garantias (Custo)", (claims || []).filter((c) => Number(c.internal_cost || 0) > 0).map((c) => claimToDrilldown(c, "custo")))}
        />
        <KpiCard
          title="Equip. em Garantia" value={equipInWarrantyList.length} icon={TrendingUp}
          onClick={() => openDrilldown("Equipamentos em Garantia", equipInWarrantyList.map(equipToDrilldown))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">        
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Garantias: Status</h3>
          {hasPieData ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={COLORS[entry.name === "Em análise" ? 0 : entry.name === "Aprovadas" ? 1 : 2]} />
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
                      if (entry.name === "Em análise") openDrilldown("Garantias Em Análise", warrantyInAnalysisList.map((c) => claimToDrilldown(c, "em_analise")));
                      else if (entry.name === "Aprovadas") openDrilldown("Garantias Aprovadas", approvedClaimsList.map((c) => claimToDrilldown(c, "aprovada")));
                      else openDrilldown("Garantias Reprovadas", rejectedClaimsList.map((c) => claimToDrilldown(c, "reprovada")));
                    }}
                    className="flex items-center gap-1.5 text-xs hover:underline cursor-pointer"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[entry.name === "Em análise" ? 0 : entry.name === "Aprovadas" ? 1 : 2] }} />
                    {entry.name} ({entry.value})
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-16">Nenhuma garantia registrada ainda.</p>
          )}
        </motion.div>
        <ProblemRanking />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <DeviceFrequencyRanking history={serviceHistory || []} />
        <ProblemFrequencyRanking history={serviceHistory || []} />
      </div>

      {roles.includes("admin") && (
        <div className="mb-6">
          <AiOperationalSummary />
        </div>
      )}

      {/* Drilldown Dialog */}
      <KpiDrilldownDialog
        open={!!drilldown}
        onOpenChange={(v) => { if (!v) setDrilldown(null); }}
        title={drilldown?.title || ""}
        items={drilldown?.items || []}
      />
    </div>
  );
};

export default Dashboard;
