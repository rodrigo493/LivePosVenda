// src/components/wa/WaFeedbackPanel.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface WaFeedback {
  id: string;
  score_overall: number | null;
  score_response_time: number | null;
  score_tone: number | null;
  score_commercial: number | null;
  summary: string | null;
  recommendations: string[];
  alert_level: "ok" | "warning" | "critical" | null;
  status: "pending" | "done" | "error";
  created_at: string;
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = (value / 10) * 100;
  const colorClass = value >= 7 ? "bg-emerald-500" : value >= 5 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", colorClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AlertBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const map = {
    ok: { icon: CheckCircle, label: "Bom", class: "text-emerald-600 bg-emerald-50" },
    warning: { icon: AlertTriangle, label: "Atenção", class: "text-amber-600 bg-amber-50" },
    critical: { icon: AlertTriangle, label: "Crítico", class: "text-red-600 bg-red-50" },
  } as const;
  const cfg = map[level as keyof typeof map];
  if (!cfg) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", cfg.class)}>
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

interface WaFeedbackPanelProps {
  clientId: string;
  canAnalyze?: boolean;
}

export function WaFeedbackPanel({ clientId, canAnalyze = true }: WaFeedbackPanelProps) {
  const [open, setOpen] = useState(true);
  const qc = useQueryClient();

  const { data: feedback, isLoading } = useQuery<WaFeedback | null>({
    queryKey: ["wa-feedback", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("wa_feedbacks")
        .select("*")
        .eq("client_id", clientId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      return {
        ...data,
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      } as WaFeedback;
    },
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 5_000 : false),
  });

  const analyze = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("analyze-wa-conversation", {
        body: { client_id: clientId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Análise iniciada — resultado em ~20s");
      qc.invalidateQueries({ queryKey: ["wa-feedback", clientId] });
    },
    onError: () => toast.error("Erro ao iniciar análise"),
  });

  const showAnalyzeBtn = canAnalyze && (!feedback || feedback.status === "error");
  const isPending = feedback?.status === "pending";

  return (
    <div className="border-t bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Análise IA
          {feedback?.alert_level && <AlertBadge level={feedback.alert_level} />}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando análise...
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <Clock className="h-4 w-4 animate-pulse" /> Análise em andamento...
            </div>
          )}

          {feedback?.status === "done" && (
            <>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-2xl font-bold",
                  (feedback.score_overall ?? 0) >= 7 ? "text-emerald-600"
                  : (feedback.score_overall ?? 0) >= 5 ? "text-amber-500" : "text-red-600"
                )}>
                  {feedback.score_overall?.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">/10</span>
                <AlertBadge level={feedback.alert_level} />
              </div>

              <div className="space-y-2">
                <ScoreBar label="Tempo de resposta" value={feedback.score_response_time} />
                <ScoreBar label="Tom e profissionalismo" value={feedback.score_tone} />
                <ScoreBar label="Aproveitamento comercial" value={feedback.score_commercial} />
              </div>

              {feedback.summary && (
                <p className="text-xs text-muted-foreground leading-relaxed">{feedback.summary}</p>
              )}

              {feedback.recommendations.length > 0 && (
                <ul className="space-y-1">
                  {feedback.recommendations.map((r, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                {format(new Date(feedback.created_at), "dd/MM HH:mm", { locale: ptBR })}
              </p>
            </>
          )}

          {!isLoading && !feedback && !isPending && (
            <p className="text-xs text-muted-foreground">
              Nenhuma análise nas últimas 24h.
            </p>
          )}

          {showAnalyzeBtn && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs h-7"
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
            >
              {analyze.isPending
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Iniciando...</>
                : <><Brain className="h-3 w-3" /> Analisar agora</>}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
