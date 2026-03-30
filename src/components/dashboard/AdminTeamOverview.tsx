import { COMPACT_LIST_LIMIT } from "@/constants/limits";
import { useMemo } from "react";
import { useTickets } from "@/hooks/useTickets";
import { useTasks } from "@/hooks/useTasks";
import { AlertTriangle, PhoneOff, CalendarClock, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

function daysSince(dateStr: string | null) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

export function AdminTeamOverview() {
  const { data: tickets } = useTickets();
  const { data: tasks } = useTasks();
  const today = new Date().toISOString().slice(0, 10);

  const { data: profiles } = useQuery({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name");
      return data || [];
    },
  });

  const stats = useMemo(() => {
    const all = tickets || [];
    const allTasks = tasks || [];

    const delayed = all.filter((t: any) => daysSince(t.updated_at) >= 2 && !["resolvido", "fechado"].includes(t.status));
    const noContact = all.filter((t: any) => t.pipeline_stage === "sem_atendimento");
    const stale = all.filter((t: any) => daysSince(t.last_interaction_at) >= 2 && t.pipeline_stage !== "concluido");
    const overdueTasks = allTasks.filter((t) => t.due_date && t.due_date < today && t.status !== "concluida");

    // Per-user breakdown
    const userMap: Record<string, { name: string; delayed: number; overdue: number; noContact: number }> = {};
    const getName = (uid: string) => profiles?.find((p) => p.user_id === uid)?.full_name || "Sem nome";

    stale.forEach((t: any) => {
      const uid = t.assigned_to || "unassigned";
      if (!userMap[uid]) userMap[uid] = { name: getName(uid), delayed: 0, overdue: 0, noContact: 0 };
      userMap[uid].delayed++;
    });

    noContact.forEach((t: any) => {
      const uid = t.assigned_to || "unassigned";
      if (!userMap[uid]) userMap[uid] = { name: getName(uid), delayed: 0, overdue: 0, noContact: 0 };
      userMap[uid].noContact++;
    });

    overdueTasks.forEach((t) => {
      const uid = t.assigned_to || "unassigned";
      if (!userMap[uid]) userMap[uid] = { name: getName(uid), delayed: 0, overdue: 0, noContact: 0 };
      userMap[uid].overdue++;
    });

    const ranking = Object.entries(userMap)
      .map(([uid, data]) => ({ uid, ...data, total: data.delayed + data.overdue + data.noContact }))
      .sort((a, b) => b.total - a.total);

    return { delayed: delayed.length, noContact: noContact.length, stale: stale.length, overdueTasks: overdueTasks.length, ranking };
  }, [tickets, tasks, today, profiles]);

  const totalIssues = stats.delayed + stats.noContact + stats.overdueTasks + stats.stale;

  if (totalIssues === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Visão da Equipe</h3>
        <Badge variant="destructive" className="text-[10px] h-4 ml-auto">{totalIssues} pendências</Badge>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        {[
          { icon: AlertTriangle, label: "Clientes atrasados", count: stats.stale, color: "text-destructive", bg: "bg-destructive/10" },
          { icon: CalendarClock, label: "Tarefas vencidas", count: stats.overdueTasks, color: "text-destructive", bg: "bg-destructive/10" },
          { icon: PhoneOff, label: "Sem primeiro contato", count: stats.noContact, color: "text-warning", bg: "bg-warning/10" },
          { icon: Clock, label: "Sem interação >2d", count: stats.stale, color: "text-amber-500", bg: "bg-amber-500/10" },
        ].map((item, i) => (
          <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg ${item.bg} border`}>
            <item.icon className={`h-4 w-4 ${item.color}`} />
            <div>
              <span className="text-lg font-bold font-mono">{item.count}</span>
              <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* User ranking */}
      {stats.ranking.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold mb-2">Ranking por usuário</h4>
          <div className="space-y-1.5">
            {stats.ranking.slice(0, COMPACT_LIST_LIMIT).map((user) => (
              <div key={user.uid} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/50 border">
                <span className="font-medium">{user.name}</span>
                <div className="flex gap-2">
                  {user.delayed > 0 && <Badge variant="destructive" className="text-[9px] h-4">{user.delayed} atrasados</Badge>}
                  {user.overdue > 0 && <Badge variant="destructive" className="text-[9px] h-4">{user.overdue} tarefas</Badge>}
                  {user.noContact > 0 && <Badge variant="secondary" className="text-[9px] h-4">{user.noContact} s/ contato</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
