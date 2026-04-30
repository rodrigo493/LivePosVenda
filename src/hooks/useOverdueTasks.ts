import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOverdueTasks() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const today = new Date().toISOString().split("T")[0];

  return useQuery({
    queryKey: ["overdue-tasks-count", user?.id, isAdmin],
    enabled: !!user?.id,
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .neq("status", "concluida")
        .not("due_date", "is", null)
        .lt("due_date", today);

      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { count, error } = await q;
      if (error) throw error;
      return (count as number) || 0;
    },
  });
}
