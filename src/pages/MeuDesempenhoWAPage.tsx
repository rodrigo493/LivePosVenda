// src/pages/MeuDesempenhoWAPage.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart3, TrendingUp, AlertTriangle } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface WaFeedback {
  id: string;
  client_id: string;
  score_overall: number | null;
  score_response_time: number | null;
  score_tone: number | null;
  score_commercial: number | null;
  summary: string | null;
  alert_level: string | null;
  status: string;
  created_at: string;
  clients: { name: string | null; phone: string | null } | null;
}

const PERIODS = [
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
];

function avg(vals: (number | null)[]) {
  const nums = vals.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function ScoreCard({ label, value }: { label: string; value: number | null }) {
  const color = value === null ? "text-muted-foreground"
    : value >= 7 ? "text-emerald-600" : value >= 5 ? "text-amber-500" : "text-red-600";
  return (
    <div className="bg-white border rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold", color)}>
        {value !== null ? value.toFixed(1) : "—"}
      </p>
    </div>
  );
}

export default function MeuDesempenhoWAPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(30);

  const since = useMemo(() => subDays(new Date(), period).toISOString(), [period]);

  const { data: feedbacks = [], isLoading } = useQuery<WaFeedback[]>({
    queryKey: ["meu-desempenho-wa", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_feedbacks")
        .select("id, client_id, score_overall, score_response_time, score_tone, score_commercial, summary, alert_level, status, created_at, clients(name, phone)")
        .eq("status", "done")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WaFeedback[];
    },
    staleTime: 60_000,
  });

  const done = feedbacks.filter((f) => f.status === "done");
  const avgOverall = avg(done.map((f) => f.score_overall));
  const avgTime    = avg(done.map((f) => f.score_response_time));
  const avgTone    = avg(done.map((f) => f.score_tone));
  const avgComm    = avg(done.map((f) => f.score_commercial));
  const alertCount = done.filter((f) => f.alert_level === "critical").length;

  const chartData = done.map((f) => ({
    date: format(new Date(f.created_at), "dd/MM"),
    nota: f.score_overall !== null ? Number(f.score_overall.toFixed(1)) : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu Desempenho WhatsApp"
        description="Evolução das análises de qualidade das suas conversas"
        icon={BarChart3}
      />

      {/* Seletor de período */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            size="sm"
            variant={period === p.days ? "default" : "outline"}
            onClick={() => setPeriod(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Cards de média */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ScoreCard label="Nota geral" value={avgOverall} />
        <ScoreCard label="Tempo de resposta" value={avgTime} />
        <ScoreCard label="Tom e profissionalismo" value={avgTone} />
        <ScoreCard label="Aproveitamento comercial" value={avgComm} />
      </div>

      {alertCount > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {alertCount} conversa{alertCount !== 1 ? "s" : ""} crítica{alertCount !== 1 ? "s" : ""} no período
        </div>
      )}

      {/* Gráfico de evolução */}
      {chartData.length > 1 && (
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Evolução da nota geral
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => [`${v}`, "Nota"]} />
              <Line
                type="monotone" dataKey="nota" stroke="#10b981"
                strokeWidth={2} dot={{ r: 3 }} connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de feedbacks */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-medium">Histórico de análises</p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
        ) : done.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma análise concluída no período.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-4 py-2">Cliente</th>
                <th className="text-right px-4 py-2">Nota</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Resumo</th>
                <th className="text-right px-4 py-2">Conversa</th>
              </tr>
            </thead>
            <tbody>
              {done.map((f) => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                    {format(new Date(f.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2">
                    {f.clients?.name ?? f.clients?.phone ?? f.client_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    <span className={cn(
                      (f.score_overall ?? 0) >= 7 ? "text-emerald-600"
                      : (f.score_overall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                    )}>
                      {f.score_overall?.toFixed(1) ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground hidden md:table-cell max-w-xs truncate">
                    {f.summary}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => navigate("/minhas-conversas-wa")}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
