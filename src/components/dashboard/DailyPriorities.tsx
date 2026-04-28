import { useMemo, useState } from "react";
import {
  AlertTriangle, PhoneOff, CalendarClock, ListChecks, Clock, ChevronDown, ChevronUp, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion, AnimatePresence } from "framer-motion";

interface DailyPrioritiesProps {
  tickets: any[];
  tasks: any[];
  today: string;
  userName?: string;
  hideBlocks?: boolean;
}

function daysSince(dateStr: string | null) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

interface PriorityBlock {
  key: string;
  icon: any;
  label: string;
  count: number;
  color: string;
  bgColor: string;
  items: any[];
}

export function DailyPriorities({ tickets, tasks, today, userName, hideBlocks }: DailyPrioritiesProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const blocks = useMemo<PriorityBlock[]>(() => {
    const delayed = tickets.filter(
      (t) => daysSince(t.last_interaction_at) >= 2 && t.pipeline_stage !== "concluido"
    );
    const noContact = tickets.filter((t) => t.pipeline_stage === "sem_atendimento");
    const stale = tickets.filter(
      (t) =>
        daysSince(t.last_interaction_at) >= 2 &&
        t.pipeline_stage !== "concluido" &&
        t.pipeline_stage !== "sem_atendimento"
    );
    const overdueTasks = tasks.filter(
      (t) => t.due_date && t.due_date < today && t.status !== "concluida"
    );
    const todayTasks = tasks.filter(
      (t) => t.due_date === today && t.status !== "concluida"
    );

    return [
      {
        key: "delayed",
        icon: AlertTriangle,
        label: "Clientes atrasados",
        count: delayed.length,
        color: "text-destructive",
        bgColor: "bg-destructive/10 border-destructive/20",
        items: delayed,
      },
      {
        key: "overdue_tasks",
        icon: CalendarClock,
        label: "Tarefas vencidas",
        count: overdueTasks.length,
        color: "text-destructive",
        bgColor: "bg-destructive/10 border-destructive/20",
        items: overdueTasks,
      },
      {
        key: "today_tasks",
        icon: ListChecks,
        label: "Tarefas para hoje",
        count: todayTasks.length,
        color: "text-primary",
        bgColor: "bg-primary/10 border-primary/20",
        items: todayTasks,
      },
      {
        key: "no_contact",
        icon: PhoneOff,
        label: "Sem primeiro contato",
        count: noContact.length,
        color: "text-warning",
        bgColor: "bg-warning/10 border-warning/20",
        items: noContact,
      },
      {
        key: "stale",
        icon: Clock,
        label: "Sem interação >2 dias",
        count: stale.length,
        color: "text-amber-500",
        bgColor: "bg-amber-500/10 border-amber-500/20",
        items: stale,
      },
    ];
  }, [tickets, tasks, today]);

  const totalIssues = blocks.reduce((s, b) => s + b.count, 0);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  }, []);

  const summaryParts = blocks.filter((b) => b.count > 0).map((b) => `${b.count} ${b.label.toLowerCase()}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl border shadow-card p-4 mb-6"
    >
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Prioridades do dia</h3>
        {totalIssues > 0 && (
          <Badge variant="destructive" className="text-[10px] h-4 ml-auto">
            {totalIssues} pendência{totalIssues > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Daily summary message */}
      {totalIssues > 0 ? (
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          {greeting}{userName ? `, ${userName}` : ""}. Hoje você tem{" "}
          <span className="font-semibold text-foreground">{summaryParts.join(", ")}</span>.
          Priorize os atendimentos atrasados e clientes sem retorno.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mb-3">
          {greeting}{userName ? `, ${userName}` : ""}! Tudo em dia. Nenhuma pendência urgente. 🎉
        </p>
      )}

      {/* Priority blocks */}
      {!hideBlocks && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {blocks.map((block) => {
            const Icon = block.icon;
            const isOpen = expanded === block.key;
            return (
              <div key={block.key}>
                <button
                  onClick={() => setExpanded(isOpen ? null : block.key)}
                  className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-sm ${block.bgColor} ${
                    isOpen ? "ring-1 ring-primary/30" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <Icon className={`h-3.5 w-3.5 ${block.color}`} />
                    {isOpen ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-xl font-bold font-mono">{block.count}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{block.label}</p>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 border rounded-lg p-3 max-h-[300px] overflow-y-auto space-y-1.5">
              {blocks
                .find((b) => b.key === expanded)
                ?.items.map((item: any) => (
                  <ExpandedItem key={item.id} item={item} type={expanded} />
                ))}
              {blocks.find((b) => b.key === expanded)?.items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhum item</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ExpandedItem({ item, type }: { item: any; type: string }) {
  const isTask = type === "overdue_tasks" || type === "today_tasks";

  if (isTask) {
    return (
      <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50 border">
        <div className="min-w-0">
          <p className="font-medium truncate">{item.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {item.clients?.name} · Vence: {item.due_date}
          </p>
        </div>
        <StatusBadge status={item.priority} />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50 border">
      <div className="min-w-0">
        <p className="font-medium truncate">{item.clients?.name || "—"}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {item.title} · {item.ticket_number}
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Badge variant="destructive" className="text-[9px] h-4">
          {daysSince(item.last_interaction_at)}d
        </Badge>
        <StatusBadge status={item.priority} />
      </div>
    </div>
  );
}
