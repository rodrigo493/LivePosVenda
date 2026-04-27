import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Conversation {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export function useWhatsAppConversations() {
  return useQuery({
    queryKey: ["whatsapp-conversations"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("client_id, message_text, direction, created_at, clients(name, phone, whatsapp, whatsapp_last_read_at)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const map = new Map<string, Conversation>();
      for (const msg of data || []) {
        if (!msg.client_id) continue;
        const client = msg.clients as any;
        // Skip orphaned messages (no client record) or clients without a real name
        if (!client || !client.name) continue;
        const lastReadAt = client.whatsapp_last_read_at ? new Date(client.whatsapp_last_read_at).getTime() : null;
        const msgTime = new Date(msg.created_at).getTime();
        // Only mark as unread if there's a known read timestamp to compare against
        const isUnread = msg.direction === "inbound" && lastReadAt !== null && msgTime > lastReadAt;
        if (!map.has(msg.client_id)) {
          map.set(msg.client_id, {
            client_id: msg.client_id,
            client_name: client.name,
            client_phone: client?.whatsapp || client?.phone || null,
            last_message: msg.message_text,
            last_message_at: msg.created_at,
            unread_count: isUnread ? 1 : 0,
          });
        } else if (isUnread) {
          const conv = map.get(msg.client_id)!;
          conv.unread_count += 1;
        }
      }

      return Array.from(map.values()).sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await (supabase as any).rpc("mark_client_whatsapp_read", {
        p_client_id: clientId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });
}
