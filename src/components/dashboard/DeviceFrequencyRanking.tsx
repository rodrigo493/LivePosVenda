import { RANKING_LIMIT } from "@/constants/limits";
import { motion } from "framer-motion";
import { Wrench } from "lucide-react";
import { useMemo } from "react";
import { ServiceHistoryRecord } from "@/hooks/useAllServiceHistory";

interface Props {
  history: ServiceHistoryRecord[];
}

// Normalize device names to group variants (e.g. "V5 Plus Torre" → "V5 Plus")
function normalizeDevice(raw: string): string {
  let d = raw.trim();
  // Remove serial numbers after " - " (e.g. "V12 - 3333333333333")
  d = d.replace(/\s*-\s*[\w]+$/, "").trim();
  // Normalize casing
  const upper = d.toUpperCase();
  // Map known variants
  if (upper.startsWith("V5 PLUS") || upper.startsWith("V5PLUS")) return "V5 Plus";
  if (upper.startsWith("V5X")) return "V5X";
  if (upper.startsWith("V8X") || upper.startsWith("V8 X")) return "V8X";
  if (upper === "V1" || upper.startsWith("V1 ")) return "V1";
  if (upper === "V2" || upper.startsWith("V2 ")) return "V2";
  if (upper === "V4" || upper.startsWith("V4 ")) return "V4";
  if (upper === "V5" || upper === "V5 ") return "V5";
  if (upper === "V6" || upper.startsWith("V6 ")) return "V6";
  if (upper.startsWith("V12")) return "V12";
  // Fallback: title case
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function DeviceFrequencyRanking({ history }: Props) {
  const ranking = useMemo(() => {
    if (!history?.length) return [];
    const counts: Record<string, number> = {};
    history.forEach((h) => {
      const device = (h.device || "").trim();
      if (!device) return;
      const key = normalizeDevice(device);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, RANKING_LIMIT)
      .map(([device, count]) => ({ device, count }));
  }, [history]);

  const max = Math.max(...ranking.map((r) => r.count), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-card rounded-xl border shadow-card p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <Wrench className="h-4 w-4 text-primary" />
        <div>
          <h3 className="font-display font-semibold text-sm">Aparelhos — Frequência de Assistência</h3>
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
                  <span className="text-xs font-semibold truncate">{item.device}</span>
                  <span className="text-xs font-mono font-semibold">{item.count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(item.count / max) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.05 * i }}
                    className="h-full bg-primary rounded-full"
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
