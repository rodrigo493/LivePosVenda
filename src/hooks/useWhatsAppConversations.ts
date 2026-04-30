import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Conversation {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  last_message: string;
  last_message_at: string;
  last_message_direction: "inbound" | "outbound";
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
            last_message_direction: (msg.direction as "inbound" | "outbound") ?? "outbound",
            unread_count: isUnread ? 1 : 0,
          });
        } else if (isUnread) {
          const conv = map.get(msg.client_id)!;
          conv.unread_count += 1;
        }
      }

      // Deduplica por telefone (últimos 8 dígitos) para evitar duplicatas
      // causadas por clientes registrados duas vezes com o mesmo número
      const byPhone = new Map<string, Conversation>();
      for (const conv of map.values()) {
        const phoneKey = conv.client_phone
          ? conv.client_phone.replace(/\D/g, "").slice(-8)
          : conv.client_id;
        const existing = byPhone.get(phoneKey);
        if (!existing) {
          byPhone.set(phoneKey, { ...conv });
        } else {
          // Mantém o mais recente como representante; soma os não lidos
          existing.unread_count += conv.unread_count;
          if (new Date(conv.last_message_at) > new Date(existing.last_message_at)) {
            existing.client_id = conv.client_id;
            existing.last_message = conv.last_message;
            existing.last_message_at = conv.last_message_at;
            existing.last_message_direction = conv.last_message_direction;
          }
        }
      }

      return Array.from(byPhone.values()).sort(
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
    onMutate: async (clientId: string) => {
      await qc.cancelQueries({ queryKey: ["whatsapp-conversations"] });
      const prev = qc.getQueryData<Conversation[]>(["whatsapp-conversations"]);
      qc.setQueryData<Conversation[]>(["whatsapp-conversations"], (old) =>
        (old || []).map((c) => c.client_id === clientId ? { ...c, unread_count: 0 } : c)
      );
      return { prev };
    },
    onError: (_err: unknown, _clientId: string, context: { prev?: Conversation[] } | undefined) => {
      if (context?.prev) qc.setQueryData(["whatsapp-conversations"], context.prev);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });
}
