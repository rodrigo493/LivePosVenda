import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useUnansweredAck() {
  const qc = useQueryClient();

  const query = useQuery<string | null>({
    queryKey: ["unanswered-ack-at"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("rd_integration_config")
        .select("unanswered_ack_at")
        .limit(1)
        .maybeSingle();
      return (data as any)?.unanswered_ack_at ?? null;
    },
  });

  const ack = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const { data: row } = await supabase
        .from("rd_integration_config")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (!row) return;
      await supabase
        .from("rd_integration_config")
        .update({ unanswered_ack_at: now } as any)
        .eq("id", (row as any).id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unanswered-ack-at"] }),
  });

  return { ackAt: query.data ?? null, ack: ack.mutate, isAcking: ack.isPending };
}
