import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUnansweredAck() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const qc = useQueryClient();
  const [isAcking, setIsAcking] = useState(false);

  const { data: ackAt = null } = useQuery<string | null>({
    queryKey: ["unanswered-ack", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("unanswered_ack_at")
        .eq("id", userId)
        .maybeSingle();
      return (data as any)?.unanswered_ack_at ?? null;
    },
  });

  const ack = useCallback(async () => {
    if (!userId) return;
    setIsAcking(true);
    try {
      const now = new Date().toISOString();
      await (supabase as any)
        .from("profiles")
        .update({ unanswered_ack_at: now })
        .eq("id", userId);
      qc.invalidateQueries({ queryKey: ["unanswered-ack", userId] });
    } finally {
      setIsAcking(false);
    }
  }, [userId, qc]);

  return { ackAt, ack, isAcking };
}
