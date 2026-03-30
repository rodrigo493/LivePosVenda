import { RANKING_LIMIT } from "@/constants/limits";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { ServiceHistoryRecord } from "@/hooks/useAllServiceHistory";

interface Props {
  history: ServiceHistoryRecord[];
}

export function ProblemFrequencyRanking({ history }: Props) {
  const ranking = useMemo(() => {
    if (!history?.length) return [];
    const counts: Record<string, number> = {};
    history.forEach((h) => {
      const problem = (h.problem_reported || "").trim();
      if (!problem) return;
      // Normalize: lowercase, trim, truncate to first 80 chars for grouping
      const key = problem.toLowerCase().slice(0, 80);
      counts[key] = (counts[key] || 0) + 1;
    });
    const nameMap: Record<string, string> = {};
    history.forEach((h) => {
      const problem = (h.problem_reported || "").trim();
      if (!problem) return;
      const key = problem.toLowerCase().slice(0, 80);
      if (!nameMap[key]) nameMap[key] = problem.length > 80 ? problem.slice(0, 77) + "..." : problem;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, RANKING_LIMIT)
      .map(([key, count]) => ({ problem: nameMap[key], count }));
  }, [history]);

  const max = Math.max(...ranking.map((r) => r.count), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-card rounded-xl border shadow-card p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <div>
          <h3 className="font-display font-semibold text-sm">Problemas Mais Frequentes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Baseado no histórico de atendimentos</p>
        </div>
      </div>
      {!ranking.length ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nenhum histórico registrado ainda.</p>
      ) : (
        <div className="space-y-3">
          {ranking.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground w-5 text-right">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold truncate" title={item.problem}>{item.problem}</span>
                  <span className="text-xs font-mono font-semibold shrink-0 ml-2">{item.count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.count / max) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.05 * i }}
                    className="h-full bg-destructive/80 rounded-full"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
