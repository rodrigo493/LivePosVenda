// src/components/dashboard/LossReasonsWidget.tsx
import { TrendingDown } from "lucide-react";
import { useLossReasonsStats } from "@/hooks/useLossReasons";

export function LossReasonsWidget() {
  const { data: stats, isLoading } = useLossReasonsStats();

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="h-4 w-4 text-destructive" />
        <h2 className="text-sm font-semibold text-foreground">Principais Motivos de Perda</h2>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 animate-pulse h-20" />
          ))}
        </div>
      ) : !stats || stats.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma negociação perdida registrada ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {stats.map((reason) => (
            <div
              key={reason.id}
              className="rounded-lg border bg-card p-3 flex flex-col gap-1 hover:bg-destructive/5 transition-colors"
            >
              <span className="text-2xl font-bold text-destructive leading-none">
                {reason.ticket_count}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-2 leading-snug">
                {reason.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
