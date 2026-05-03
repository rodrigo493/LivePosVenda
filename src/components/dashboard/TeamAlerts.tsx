import { MessageSquare, UserPlus, Clock, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useTeamAlerts } from "@/hooks/useTeamAlerts";

export function TeamAlerts() {
  const { data: team = [], isLoading } = useTeamAlerts();

  if (isLoading || team.length === 0) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-zinc-500" />
        <h3 className="font-display font-semibold text-sm">Alertas por Usuário</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] text-muted-foreground uppercase tracking-wide">
              <th className="text-left pb-2 font-medium">Usuário</th>
              <th className="text-center pb-2 font-medium">
                <span className="flex items-center justify-center gap-1">
                  <UserPlus className="h-3 w-3 text-green-500" />
                  Leads
                </span>
              </th>
              <th className="text-center pb-2 font-medium">
                <span className="flex items-center justify-center gap-1">
                  <MessageSquare className="h-3 w-3 text-orange-500" />
                  Msgs
                </span>
              </th>
              <th className="text-center pb-2 font-medium">
                <span className="flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3 text-red-500" />
                  Tarefas
                </span>
              </th>
              <th className="text-center pb-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {team.map((u) => {
              const total = u.newLeads + u.unreadMessages + u.overdueTasks;
              return (
                <tr key={u.userId} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                        {u.userName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-xs truncate max-w-[120px]">
                        {u.userName.split(" ")[0]}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-center">
                    {u.newLeads > 0 ? (
                      <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[11px] font-bold px-1.5">
                        {u.newLeads}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {u.unreadMessages > 0 ? (
                      <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[11px] font-bold px-1.5">
                        {u.unreadMessages}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {u.overdueTasks > 0 ? (
                      <span className="inline-flex items-center justify-center h-5 min-w-5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[11px] font-bold px-1.5">
                        {u.overdueTasks}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <span className={`inline-flex items-center justify-center h-5 min-w-5 rounded-full text-[11px] font-bold px-1.5 ${
                      total >= 5 ? "bg-red-600 text-white" : total >= 2 ? "bg-amber-500 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                    }`}>
                      {total}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
