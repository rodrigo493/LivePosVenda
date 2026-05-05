import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InstagramConversation {
  id: string;
  ig_sender_id: string;
  sender_username: string | null;
  sender_picture: string | null;
  last_message: string | null;
  last_message_at: string;
  unread_count: number;
  assigned_user_id: string | null;
  client_id: string | null;
  channel: "instagram";
  display_name: string;
}

export function mergeAndSortConversations<
  T extends { last_message_at: string; channel: string }
>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );
}

export function useInstagramConversations() {
  const { user } = useAuth();

  return useQuery<InstagramConversation[]>({
    queryKey: ["instagram-conversations"],
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("instagram_conversations")
        .select("*")
        .order("last_message_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        ...row,
        channel: "instagram" as const,
        display_name: row.sender_username
          ? `@${row.sender_username}`
          : `IG ${String(row.ig_sender_id).slice(-6)}`,
      }));
    },
  });
}

export function useMarkInstagramConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await (supabase as any)
        .from("instagram_conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["instagram-conversations"] });
      const prev = qc.getQueryData<InstagramConversation[]>(["instagram-conversations"]);
      qc.setQueryData<InstagramConversation[]>(["instagram-conversations"], (old) =>
        (old ?? []).map((c) => c.id === id ? { ...c, unread_count: 0 } : c)
      );
      return { prev };
    },
    onError: (_err: unknown, _id: string, ctx: { prev?: InstagramConversation[] } | undefined) => {
      if (ctx?.prev) qc.setQueryData(["instagram-conversations"], ctx.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instagram-conversations"] });
    },
  });
}
