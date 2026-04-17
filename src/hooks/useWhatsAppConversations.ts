import { useQuery } from "@tanstack/react-query";
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("client_id, message_text, direction, created_at, clients(name, phone, whatsapp)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const map = new Map<string, Conversation>();
      for (const msg of data || []) {
        if (!msg.client_id) continue;
        if (!map.has(msg.client_id)) {
          const client = msg.clients as any;
          map.set(msg.client_id, {
            client_id: msg.client_id,
            client_name: client?.name || msg.client_id,
            client_phone: client?.whatsapp || client?.phone || null,
            last_message: msg.message_text,
            last_message_at: msg.created_at,
            unread_count: msg.direction === "inbound" ? 1 : 0,
          });
        } else if (msg.direction === "inbound") {
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
