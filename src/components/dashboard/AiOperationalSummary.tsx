import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Brain, RefreshCw, Users, AlertTriangle, Activity, TrendingUp, Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReactMarkdown from "react-markdown";

type UserReport = {
  user_id: string;
  name: string;
  roles: string[];
  totalActions: number;
  ticketsCreated: number;
  ticketsResolved: number;
  ticketsPending: number;
  osCreated: number;
  osCompleted: number;
  osPending: number;
  quotesCreated: number;
  delayedTickets: number;
  delayedOs: number;
  delayedItems: string[];
  classification: string;
};

type ReportResponse = {
  report: string;
  report_date: string;
  total_actions: number;
  total_delays: number;
  total_tickets: number;
  total_users: number;
  users: UserReport[];
};

const classificationConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  alta_performance: { label: "Alta Performance", variant: "default" },
  em_dia: { label: "Em Dia", variant: "secondary" },
  atencao: { label: "Atenção", variant: "outline" },
  critico: { label: "Crítico", variant: "destructive" },
  regular: { label: "Regular", variant: "secondary" },
};

export function AiOperationalSummary() {
  const [period, setPeriod] = useState("hoje");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const getReportDate = () => {
    const now = new Date();
    if (period === "ontem") {
      now.setDate(now.getDate() - 1);
    }
    return now.toISOString().split("T")[0];
  };

  const generateReport = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Não autenticado");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-daily-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ reportDate: getReportDate() }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        if (res.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em alguns minutos.");
        if (res.status === 402) throw new Error("Créditos de IA insuficientes. Adicione créditos na configuração do workspace.");
        throw new Error(err.error || "Erro ao gerar relatório");
      }
      return res.json() as Promise<ReportResponse>;
    },
    onError: (err: Error) => {
      toast.error(err.message || "Erro ao gerar relatório");
    },
  });

  const data = generateReport.data;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Header */}
      <div className="bg-card rounded-xl border shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h3 className="font-display font-semibold text-sm">Resumo Operacional com IA</h3>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="ontem">Ontem</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => generateReport.mutate()}
              disabled={generateReport.isPending}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generateReport.isPending ? "animate-spin" : ""}`} />
              {generateReport.isPending ? "Gerando..." : "Gerar Relatório"}
            </Button>
          </div>
        </div>

        {!data && !generateReport.isPending && (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Clique em "Gerar Relatório" para analisar as atividades da equipe.</p>
          </div>
        )}

        {generateReport.isPending && (
          <div className="text-center py-12 text-muted-foreground">
            <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
            <p className="text-sm">Analisando atividades da equipe...</p>
          </div>
        )}
      </div>

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border shadow-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wider">Usuários Ativos</span>
              </div>
              <p className="text-2xl font-display font-bold">{data.total_users}</p>
            </div>
            <div className="bg-card rounded-xl border shadow-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Activity className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wider">Ações do Dia</span>
              </div>
              <p className="text-2xl font-display font-bold">{data.total_actions}</p>
            </div>
            <div className="bg-card rounded-xl border shadow-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wider">Atrasos</span>
              </div>
              <p className="text-2xl font-display font-bold text-destructive">{data.total_delays}</p>
            </div>
            <div className="bg-card rounded-xl border shadow-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-[10px] uppercase tracking-wider">Chamados</span>
              </div>
              <p className="text-2xl font-display font-bold">{data.total_tickets}</p>
            </div>
          </div>

          {/* AI Report */}
          <div className="bg-card rounded-xl border shadow-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Brain className="h-4 w-4 text-primary" />
              <h4 className="font-display font-semibold text-sm">Relatório da IA</h4>
              <Badge variant="secondary" className="text-[10px]">{data.report_date}</Badge>
            </div>
            <div className="prose prose-sm max-w-none text-sm text-foreground/90 leading-relaxed">
              <ReactMarkdown skipHtml>{data.report}</ReactMarkdown>
            </div>
          </div>

          {/* User List */}
          <div className="bg-card rounded-xl border shadow-card p-6">
            <h4 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Desempenho por Usuário
            </h4>
            <div className="space-y-2">
              {data.users
                .sort((a, b) => {
                  const order = { critico: 0, atencao: 1, em_dia: 2, regular: 3, alta_performance: 4 };
                  return (order[a.classification] ?? 3) - (order[b.classification] ?? 3);
                })
                .map((user) => {
                  const cfg = classificationConfig[user.classification] || classificationConfig.regular;
                  const isExpanded = expandedUser === user.user_id;

                  return (
                    <div key={user.user_id} className="rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                      <button
                        className="w-full flex items-center justify-between p-3 text-left"
                        onClick={() => setExpandedUser(isExpanded ? null : user.user_id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {user.roles.join(" / ")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right hidden md:block">
                            <p className="text-xs text-muted-foreground">
                              {user.totalActions} ações · {user.delayedTickets + user.delayedOs} atrasos
                            </p>
                          </div>
                          <Badge variant={cfg.variant} className="text-[10px]">
                            {cfg.label}
                          </Badge>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 border-t mx-3 pt-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            <div>
                              <p className="text-muted-foreground">Chamados criados</p>
                              <p className="font-semibold">{user.ticketsCreated}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Chamados resolvidos</p>
                              <p className="font-semibold text-primary">{user.ticketsResolved}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Chamados pendentes</p>
                              <p className="font-semibold text-accent-foreground">{user.ticketsPending}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">OS criadas</p>
                              <p className="font-semibold">{user.osCreated}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">OS concluídas</p>
                              <p className="font-semibold text-primary">{user.osCompleted}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">OS pendentes</p>
                              <p className="font-semibold text-accent-foreground">{user.osPending}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Orçamentos</p>
                              <p className="font-semibold">{user.quotesCreated}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Atrasos</p>
                              <p className={`font-semibold ${(user.delayedTickets + user.delayedOs) > 0 ? "text-destructive" : "text-primary"}`}>
                                {user.delayedTickets + user.delayedOs}
                              </p>
                            </div>
                          </div>
                          {user.delayedItems.length > 0 && (
                            <div className="mt-3 p-2 bg-destructive/5 rounded-md border border-destructive/10">
                              <p className="text-[10px] uppercase tracking-wider text-destructive font-medium mb-1">Itens Atrasados</p>
                              {user.delayedItems.map((item, i) => (
                                <p key={i} className="text-xs text-destructive/80">• {item}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
