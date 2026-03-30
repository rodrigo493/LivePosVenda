import { FlaskConical } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProblemRanking } from "@/components/dashboard/ProblemRanking";
import { motion } from "framer-motion";
import { useTickets } from "@/hooks/useTickets";
import { useWarrantyClaims } from "@/hooks/useWarrantyAndService";
import { useMemo } from "react";
import { COMPACT_LIST_LIMIT } from "@/constants/limits";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const EngineeringPage = () => {
  const { data: tickets } = useTickets();
  const { data: claims } = useWarrantyClaims();

  const failuresByModel = useMemo(() => {
    if (!tickets?.length) return [];
    const grouped: Record<string, number> = {};
    tickets.forEach((t: any) => {
      const model = t.equipments?.equipment_models?.name || "Outros";
      grouped[model] = (grouped[model] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([model, falhas]) => ({ model, falhas }))
      .sort((a, b) => b.falhas - a.falhas)
      .slice(0, COMPACT_LIST_LIMIT);
  }, [tickets]);

  const trendData = useMemo(() => {
    if (!tickets?.length) return [];
    const months: Record<string, number> = {};
    tickets.forEach((t: any) => {
      const date = new Date(t.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months[key] = (months[key] || 0) + 1;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([mes, falhas]) => ({
        mes: new Date(mes + "-01").toLocaleDateString("pt-BR", { month: "short" }),
        falhas,
      }));
  }, [tickets]);

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

  return (
    <div>
      <PageHeader title="Engenharia / Analytics" description="Análise de falhas, tendências e insights para melhoria contínua" icon={FlaskConical} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Falhas por Modelo</h3>
          {failuresByModel.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={failuresByModel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="model" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="falhas" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-16">Nenhum dado disponível.</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4">Tendência de Chamados (6 meses)</h3>
          {trendData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="falhas" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={{ fill: "hsl(0, 84%, 60%)" }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-16">Nenhum dado disponível.</p>
          )}
        </motion.div>
      </div>

      {warrantyCostByModel.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border shadow-card p-6 mb-6">
          <h3 className="font-display font-semibold text-sm mb-4">Custo de Garantia por Modelo</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={warrantyCostByModel}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="model" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
              <Bar dataKey="custo" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <ProblemRanking />
    </div>
  );
};

export default EngineeringPage;
