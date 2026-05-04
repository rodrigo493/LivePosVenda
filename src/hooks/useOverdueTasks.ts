import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOverdueTasks() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");

  return useQuery({
    queryKey: ["overdue-tasks-count", user?.id, isAdmin],
    enabled: !!user?.id,
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];

      // Busca overdue_ack_at do perfil (profiles usa user_id, não id)
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("overdue_ack_at")
        .eq("user_id", user!.id)
        .maybeSingle();

      const ackDate = (profile as any)?.overdue_ack_at
        ? new Date((profile as any).overdue_ack_at).toISOString().split("T")[0]
        : null;

      let q = (supabase as any)
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .neq("status", "concluida")
        .not("due_date", "is", null)
        .lt("due_date", today);

      // Só mostra tarefas que ficaram atrasadas APÓS o último reset
      if (ackDate) {
        q = q.gt("due_date", ackDate);
      }

      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { count, error } = await q;
      if (error) throw error;
      return (count as number) || 0;
    },
  });
}
