import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Conversation {
  client_id: string;
  client_name: string;
  client_phone: string | null;
  last_message: string;
  last_message_at: string;
  last_message_direction: "inbound" | "outbound";
  unread_count: number;
}

// filterUserId: null = todos (admin), string = filtrar por assigned_to
export function useWhatsAppConversations(filterUserId?: string | null) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["whatsapp-conversations", userId, isAdmin, filterUserId ?? "all"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15_000,
    enabled: !!userId,
    queryFn: async () => {
      // Determina qual filtro de assigned_to aplicar
      const targetUserId: string | null = isAdmin
        ? (filterUserId ?? null)   // admin: usa o filtro escolhido (null = todos)
        : userId;                  // não-admin: filtra pelo próprio userId + não-atribuídos

      // ── Step 1: busca mensagens (sem JOIN para evitar problemas de RLS no PostgREST) ──
      const { data: messages, error: msgError } = await supabase
        .from("whatsapp_messages")
        .select("client_id, message_text, direction, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (msgError) throw msgError;
      if (!messages?.length) return [];

      // ── Step 2: busca clientes únicos referenciados pelas mensagens ──
      const clientIds = [...new Set(messages.map((m) => m.client_id).filter(Boolean))];
      if (!clientIds.length) return [];

      let clientQuery = supabase
        .from("clients")
        .select("id, name, phone, whatsapp, whatsapp_last_read_at, assigned_to")
        .in("id", clientIds);

      // Aplica filtro de responsável
      if (isAdmin && targetUserId) {
        clientQuery = clientQuery.eq("assigned_to", targetUserId);
      } else if (!isAdmin && targetUserId) {
        clientQuery = clientQuery.or(`assigned_to.eq.${targetUserId},assigned_to.is.null`);
      }

      const { data: clients, error: clientError } = await clientQuery;
      if (clientError) throw clientError;

      // ── Step 3: monta mapa client_id → client ──
      const clientMap = new Map<string, typeof clients[number]>(
        (clients || []).map((c) => [c.id, c])
      );

      // ── Step 4: agrega por cliente ──
      const map = new Map<string, Conversation>();
      for (const msg of messages) {
        if (!msg.client_id) continue;
        const client = clientMap.get(msg.client_id);
        if (!client || !client.name) continue;

        const lastReadAt = client.whatsapp_last_read_at ? new Date(client.whatsapp_last_read_at).getTime() : null;
        const msgTime = new Date(msg.created_at).getTime();
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const isUnread = msg.direction === "inbound" &&
          msgTime > thirtyDaysAgo &&
          (lastReadAt === null || msgTime > lastReadAt);

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

      // ── Step 5: deduplica por telefone (últimos 8 dígitos) ──
      const byPhone = new Map<string, Conversation>();
      for (const conv of map.values()) {
        const phoneKey = conv.client_phone
          ? conv.client_phone.replace(/\D/g, "").slice(-8)
          : conv.client_id;
        const existing = byPhone.get(phoneKey);
        if (!existing) {
          byPhone.set(phoneKey, { ...conv });
        } else {
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
