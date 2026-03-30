import { useState, useMemo } from "react";
import { BarChart3, FileDown, Filter, HeadphonesIcon, ShieldCheck, Wrench, DollarSign, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ProblemRanking } from "@/components/dashboard/ProblemRanking";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";
import { useTickets } from "@/hooks/useTickets";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useWarrantyClaims, useServiceRequests } from "@/hooks/useWarrantyAndService";
import { useProducts } from "@/hooks/useProducts";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { CHART_COLORS as COLORS } from "@/constants/colors";
import { ticketStatusLabels as statusLabels } from "@/constants/statusLabels";
import { COMPACT_LIST_LIMIT, RANKING_LIMIT } from "@/constants/limits";

function downloadCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map((row) => headers.map((h) => {
      let value = String(row[h] ?? "").replace(/"/g, '""');
      if (/^[=+\-@\t\r]/.test(value)) {
        value = "'" + value;
      }
      return `"${value}"`;
    }).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

const ReportsPage = () => {
  const { data: tickets } = useTickets();
  const { data: orders } = useWorkOrders();
  const { data: claims } = useWarrantyClaims();
  const { data: serviceReqs } = useServiceRequests();
  const { data: products } = useProducts();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filterModel, setFilterModel] = useState("all");

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter((t: any) => {
      if (dateFrom && t.created_at < dateFrom) return false;
      if (dateTo && t.created_at > dateTo + "T23:59:59") return false;
      if (filterModel !== "all" && t.equipments?.equipment_models?.name !== filterModel) return false;
      return true;
    });
  }, [tickets, dateFrom, dateTo, filterModel]);

  // Available models for filter
  const models = useMemo(() => {
    if (!tickets) return [];
    const set = new Set(tickets.map((t: any) => t.equipments?.equipment_models?.name).filter(Boolean));
    return Array.from(set) as string[];
  }, [tickets]);

  // KPIs
  const totalTickets = filteredTickets.length;
  const openTickets = filteredTickets.filter((t: any) => t.status === "aberto").length;
  const resolvedTickets = filteredTickets.filter((t: any) => t.status === "resolvido" || t.status === "fechado").length;
  const warrantyApproved = claims?.filter((c) => c.warranty_status === "aprovada").length || 0;
  const warrantyRejected = claims?.filter((c) => c.warranty_status === "reprovada").length || 0;
  const totalWarrantyCost = claims?.reduce((s, c) => s + Number(c.internal_cost || 0), 0) || 0;

  // Average resolution time
  const avgResolutionDays = useMemo(() => {
    const resolved = filteredTickets.filter((t: any) => t.resolved_at);
    if (!resolved.length) return 0;
    const total = resolved.reduce((sum: number, t: any) => {
      const diff = new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
      return sum + diff / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(total / resolved.length);
  }, [filteredTickets]);

  // Tickets by status
  const ticketsByStatus = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredTickets.forEach((t: any) => {
      const label = statusLabels[t.status] || t.status;
      grouped[label] = (grouped[label] || 0) + 1;
    });
    return Object.entries(grouped).map(([name, value]) => ({ name, value }));
  }, [filteredTickets]);

  // Tickets by month
  const ticketsByMonth = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredTickets.forEach((t: any) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, total]) => ({ mes: new Date(mes + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }), total }));
  }, [filteredTickets]);

  // Warranty approved vs rejected
  const warrantyPieData = useMemo(() => [
    { name: "Aprovadas", value: warrantyApproved },
    { name: "Reprovadas", value: warrantyRejected },
    { name: "Em análise", value: (claims?.filter((c) => c.warranty_status === "em_analise").length || 0) },
  ].filter((d) => d.value > 0), [claims, warrantyApproved, warrantyRejected]);

  // Problems by model
  const problemsByModel = useMemo(() => {
    const grouped: Record<string, number> = {};
    filteredTickets.forEach((t: any) => {
      const model = t.equipments?.equipment_models?.name || "Outros";
      grouped[model] = (grouped[model] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([model, falhas]) => ({ model, falhas }))
      .sort((a, b) => b.falhas - a.falhas)
      .slice(0, COMPACT_LIST_LIMIT);
  }, [filteredTickets]);

  // Warranty cost by model
  const warrantyCostByModel = useMemo(() => {
    if (!claims?.length) return [];
    const grouped: Record<string, number> = {};
    claims.forEach((c: any) => {
      const model = c.tickets?.equipments?.equipment_models?.name || "Outros";
      grouped[model] = (grouped[model] || 0) + Number(c.internal_cost || 0);
    });
    return Object.entries(grouped)
      .map(([model, custo]) => ({ model, custo: Number(custo.toFixed(2)) }))
      .sort((a, b) => b.custo - a.custo);
  }, [claims]);

  // Top problems for engineering
  const topProblems = useMemo(() => {
    const grouped: Record<string, { problem: string; model: string; count: number }> = {};
    filteredTickets.forEach((t: any) => {
      const problem = t.problem_category || t.title || "Sem categoria";
      const model = t.equipments?.equipment_models?.name || "—";
      const key = `${model}__${problem}`;
      if (!grouped[key]) grouped[key] = { model, problem, count: 0 };
      grouped[key].count++;
    });
    return Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, RANKING_LIMIT);
  }, [filteredTickets]);

  // CSV export
  const exportTicketsCSV = () => {
    downloadCSV(filteredTickets.map((t: any) => ({
      Numero: t.ticket_number,
      Tipo: t.ticket_type,
      Cliente: t.clients?.name,
      Equipamento: t.equipments?.equipment_models?.name,
      Serie: t.equipments?.serial_number,
      Problema: t.problem_category || t.title,
      Prioridade: t.priority,
      Status: t.status,
      Data: new Date(t.created_at).toLocaleDateString("pt-BR"),
    })), "chamados-relatorio");
  };

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Análise gerencial e relatórios operacionais"
        icon={BarChart3}
        action={
          <Button size="sm" className="gap-1.5" onClick={exportTicketsCSV}>
            <FileDown className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
        }
      />

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-4 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Data Início</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data Fim</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Modelo</Label>
            <Select value={filterModel} onValueChange={setFilterModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os modelos</SelectItem>
                {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </motion.div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Total Chamados" value={totalTickets} icon={HeadphonesIcon} variant="primary" />
        <KpiCard title="Abertos" value={openTickets} icon={HeadphonesIcon} variant="warning" />
        <KpiCard title="Resolvidos" value={resolvedTickets} icon={HeadphonesIcon} variant="success" />
        <KpiCard title="Tempo Médio Resolução" value={`${avgResolutionDays}d`} icon={Clock} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard title="Garantias Aprovadas" value={warrantyApproved} icon={ShieldCheck} variant="success" />
        <KpiCard title="Garantias Reprovadas" value={warrantyRejected} icon={ShieldCheck} variant="default" />
        <KpiCard title="Custo Garantia" value={`R$ ${totalWarrantyCost.toFixed(0)}`} icon={DollarSign} />
        <KpiCard title="Assistências" value={serviceReqs?.length || 0} icon={Wrench} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Chamados por Período</h3>
          {ticketsByMonth.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ticketsByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-16">Sem dados no período.</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Chamados por Status</h3>
          {ticketsByStatus.length ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={ticketsByStatus} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                    {ticketsByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {ticketsByStatus.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {entry.name} ({entry.value})
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground text-center py-16">Sem dados.</p>}
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Falhas por Modelo</h3>
          {problemsByModel.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={problemsByModel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="model" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="falhas" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-16">Sem dados.</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Garantias: Aprovadas x Reprovadas</h3>
          {warrantyPieData.length ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={warrantyPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {warrantyPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {warrantyPieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {entry.name} ({entry.value})
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground text-center py-16">Sem dados.</p>}
        </motion.div>
      </div>

      {/* Warranty cost by model */}
      {warrantyCostByModel.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl border shadow-card p-6 mb-6">
          <h3 className="font-display font-semibold text-sm mb-4">Custo de Garantia por Modelo</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={warrantyCostByModel}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="model" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
              <Bar dataKey="custo" fill="hsl(0, 84%, 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Engineering Report Block */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl border shadow-card p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-sm">Relatório Mensal para Engenharia</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Consolidação de falhas, peças e custos para melhoria contínua</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
            downloadCSV(topProblems.map((p) => ({
              Modelo: p.model,
              Problema: p.problem,
              Ocorrencias: p.count,
            })), "relatorio-engenharia");
          }}>
            <FileDown className="h-3 w-3" /> Exportar
          </Button>
        </div>
        {topProblems.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["#", "Modelo", "Problema", "Ocorrências"].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topProblems.map((p, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 text-xs font-mono text-muted-foreground">#{i + 1}</td>
                    <td className="px-4 py-2 text-sm font-medium">{p.model}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{p.problem}</td>
                    <td className="px-4 py-2 text-sm font-mono font-semibold">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground text-center py-6">Sem dados para o período selecionado.</p>}
      </motion.div>

      {/* Problem Ranking */}
      <ProblemRanking />
    </div>
  );
};

export default ReportsPage;
