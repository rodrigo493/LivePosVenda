import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOverdueTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["overdue-tasks-count", user?.id],
    enabled: !!user?.id,
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      const { data: profile, error: profileErr } = await (supabase as any)
        .from("profiles")
        .select("overdue_ack_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (profileErr) console.error("[useOverdueTasks] falha ao buscar perfil:", profileErr);

      const ackDate = (profile as any)?.overdue_ack_at
        ? new Date((profile as any).overdue_ack_at).toISOString().split("T")[0]
        : null;

      // Conta apenas tarefas atrasadas do próprio usuário,
      // excluindo tarefas vinculadas a tickets já fechados/resolvidos
      let q = (supabase as any)
        .from("tasks")
        .select("id, tickets!tasks_ticket_id_fkey(status)", { count: "exact" })
        .eq("assigned_to", user!.id)
        .neq("status", "concluida")
        .not("due_date", "is", null)
        .lt("due_date", today);

      if (ackDate) {
        q = q.gt("due_date", ackDate);
      }

      const { data, error } = await q;
      if (error) throw error;

      // Filtra client-side para excluir tarefas de tickets fechados/resolvidos
      const active = ((data as any[]) ?? []).filter((t) => {
        const ticketStatus = t.tickets?.status;
        if (!ticketStatus) return true; // tarefa standalone (sem ticket) → conta
        return !["fechado", "resolvido", "cancelado"].includes(ticketStatus);
      });

      return active.length;
    },
  });
}
