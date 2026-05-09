// src/pages/AdminDesempenhoWAPage.tsx
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { BarChart3, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface WaFeedback {
  id: string;
  user_id: string | null;
  client_id: string;
  score_overall: number | null;
  score_response_time: number | null;
  score_tone: number | null;
  score_commercial: number | null;
  alert_level: string | null;
  status: string;
  summary: string | null;
  created_at: string;
  clients: { name: string | null; phone: string | null } | null;
}

interface UserRow {
  userId: string;
  name: string;
  avgOverall: number | null;
  count: number;
  alertCount: number;
  feedbacks: WaFeedback[];
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

export default function AdminDesempenhoWAPage() {
  const [period, setPeriod] = useState(30);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const since = useMemo(() => subDays(new Date(), period).toISOString(), [period]);

  const { data: feedbacks = [], isLoading } = useQuery<WaFeedback[]>({
    queryKey: ["admin-desempenho-wa", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_feedbacks")
        .select("id, user_id, client_id, score_overall, score_response_time, score_tone, score_commercial, alert_level, status, summary, created_at, clients(name, phone)")
        .eq("status", "done")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WaFeedback[];
    },
    staleTime: 60_000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-minimal"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const profileMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of profiles) {
      map[p.user_id] = p.full_name || p.email || p.user_id.slice(0, 8);
    }
    return map;
  }, [profiles]);

  const userRows = useMemo((): UserRow[] => {
    const map: Record<string, WaFeedback[]> = {};
    for (const f of feedbacks) {
      const uid = f.user_id ?? "unknown";
      if (!map[uid]) map[uid] = [];
      map[uid].push(f);
    }
    return Object.entries(map).map(([userId, fbs]) => ({
      userId,
      name: profileMap[userId] ?? userId.slice(0, 8),
      avgOverall: avg(fbs.map((f) => f.score_overall)),
      count: fbs.length,
      alertCount: fbs.filter((f) => f.alert_level === "critical").length,
      feedbacks: fbs,
    })).sort((a, b) => (a.avgOverall ?? 0) - (b.avgOverall ?? 0));
  }, [feedbacks, profileMap]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Desempenho WhatsApp — Admin"
        description="Visão consolidada de qualidade de atendimento por usuário"
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

      {/* Tabela de usuários */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <p className="text-sm font-medium">Desempenho por usuário</p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
        ) : userRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma análise concluída no período.
          </p>
        ) : (
          <div>
            {/* Header */}
            <div className="grid grid-cols-5 px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground font-medium">
              <div className="col-span-2">Usuário</div>
              <div className="text-right">Nota média</div>
              <div className="text-right">Conversas</div>
              <div className="text-right">Alertas</div>
            </div>

            {userRows.map((row) => (
              <div key={row.userId}>
                {/* Row de resumo */}
                <button
                  onClick={() => setExpandedUser(expandedUser === row.userId ? null : row.userId)}
                  className="w-full grid grid-cols-5 px-4 py-3 border-b hover:bg-muted/20 text-sm text-left"
                >
                  <div className="col-span-2 flex items-center gap-2">
                    {expandedUser === row.userId
                      ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    {row.name}
                  </div>
                  <div className={cn(
                    "text-right font-medium",
                    row.avgOverall === null ? "text-muted-foreground"
                    : row.avgOverall >= 7 ? "text-emerald-600"
                    : row.avgOverall >= 5 ? "text-amber-500" : "text-red-600"
                  )}>
                    {row.avgOverall !== null ? row.avgOverall.toFixed(1) : "—"}
                  </div>
                  <div className="text-right text-muted-foreground">{row.count}</div>
                  <div className="text-right">
                    {row.alertCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        {row.alertCount}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </div>
                </button>

                {/* Feedbacks individuais expandidos */}
                {expandedUser === row.userId && (
                  <div className="bg-muted/10 border-b">
                    {row.feedbacks.map((f) => (
                      <div key={f.id} className="grid grid-cols-5 px-8 py-2 border-b text-xs text-muted-foreground">
                        <div className="col-span-2">
                          {f.clients?.name ?? f.clients?.phone ?? f.client_id.slice(0, 8)}
                          <span className="ml-2 text-muted-foreground/50">
                            {format(new Date(f.created_at), "dd/MM HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className={cn(
                          "text-right font-medium",
                          (f.score_overall ?? 0) >= 7 ? "text-emerald-600"
                          : (f.score_overall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                        )}>
                          {f.score_overall?.toFixed(1) ?? "—"}
                        </div>
                        <div className="col-span-2 text-right truncate pl-4">{f.summary}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
