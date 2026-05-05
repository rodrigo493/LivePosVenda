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
  assigned_to: string | null;
  last_instance_id: string | null;
}

// filterUserId: null = todos (admin), string = filtrar pelas conversas do usuário
// instanceId: string = filtrar por instância específica (abas multi-instância de não-admin)
// strictOwnership: true = pula Level 3 (fallback de instância) — usar em alertas pessoais
export function useWhatsAppConversations(
  filterUserId?: string | null,
  instanceId?: string | null,
  strictOwnership?: boolean
) {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["whatsapp-conversations", userId, isAdmin, filterUserId ?? "all", instanceId ?? "all", strictOwnership ?? false],
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 15_000,
    enabled: !!userId,
    queryFn: async () => {
      const targetUserId: string | null = isAdmin
        ? (filterUserId ?? null)
        : userId;

      // ── Step 1: busca mensagens recentes (últimos 90 dias) ────────────
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: messages, error: msgError } = await supabase
        .from("whatsapp_messages")
        .select("client_id, message_text, direction, created_at, instance_id")
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (msgError) throw msgError;
      if (!messages?.length) return [];

      // ── Step 2: registra o instance_id da mensagem mais recente por cliente ──
      const lastInstancePerClient = new Map<string, string>();
      for (const msg of messages) {
        if (msg.client_id && !lastInstancePerClient.has(msg.client_id) && (msg as any).instance_id) {
          lastInstancePerClient.set(msg.client_id, (msg as any).instance_id);
        }
      }

      // ── Step 3: busca todos os clientes que aparecem nas mensagens ────
      const clientIds = [...new Set(messages.map((m) => m.client_id).filter(Boolean))];
      if (!clientIds.length) return [];

      const { data: allClients, error: clientError } = await supabase
        .from("clients")
        .select("id, name, phone, whatsapp, whatsapp_last_read_at, assigned_to")
        .in("id", clientIds);

      if (clientError) throw clientError;
      if (!allClients?.length) return [];

      // ── Step 4: resolve o responsável de cada cliente ─────────────────
      // Hierarquia (do mais para o menos prioritário):
      //   1. clients.assigned_to  (atribuição manual — sempre respeitada)
      //   2. pipeline_whatsapp_instances.user_id da última mensagem
      //      (quem recebeu a última mensagem no WhatsApp é o dono da conversa no chat)
      //   3. tickets.assigned_to  (ticket CRM — fallback quando nenhum dos acima se aplica)
      //
      // L3 é o MAIS BAIXO porque um cliente pode ter um ticket CRM com a vendedora
      // mas mandar mensagem para o pós-venda: nesse caso a conversa deve ir para
      // o pós-venda (L2) e não continuar aparecendo para a vendedora (L3).
      let clientOwnerMap = new Map<string, string>(); // client_id → user_id efetivo

      if (targetUserId && !instanceId) {
        // Nível 1: clients.assigned_to (manual — maior prioridade)
        for (const c of allClients) {
          if (c.assigned_to) clientOwnerMap.set(c.id, c.assigned_to);
        }

        // Nível 2: user_id da instância da última mensagem (para clientes sem atribuição manual)
        // Pulado quando strictOwnership=true (notificações pessoais), evitando que clientes
        // "sem dono" sejam atribuídos a quem possui a instância principal.
        const afterLevel1 = clientIds.filter((id) => !clientOwnerMap.has(id));
        if (afterLevel1.length && !strictOwnership) {
          const { data: instanceRows } = await (supabase as any)
            .from("pipeline_whatsapp_instances")
            .select("id, user_id")
            .not("user_id", "is", null);

          const instanceUserIdMap = new Map<string, string>(
            ((instanceRows ?? []) as any[]).map((i: any) => [i.id, i.user_id])
          );

          for (const clientId of afterLevel1) {
            const lastInst = lastInstancePerClient.get(clientId);
            if (lastInst) {
              const instUser = instanceUserIdMap.get(lastInst);
              if (instUser) clientOwnerMap.set(clientId, instUser);
            }
          }
        }

        // Nível 3: tickets.assigned_to para clientes sem L1 e sem L2 (ticket CRM como fallback)
        const afterLevel2 = clientIds.filter((id) => !clientOwnerMap.has(id));
        if (afterLevel2.length) {
          const { data: tickets } = await (supabase as any)
            .from("tickets")
            .select("client_id, assigned_to")
            .in("client_id", afterLevel2)
            .not("assigned_to", "is", null)
            .is("deleted_at", null)
            .order("created_at", { ascending: false });

          for (const t of (tickets ?? []) as any[]) {
            if (t.client_id && t.assigned_to && !clientOwnerMap.has(t.client_id)) {
              clientOwnerMap.set(t.client_id, t.assigned_to);
            }
          }
        }
      }

      // ── Step 6: filtra clientes ───────────────────────────────────────
      const clients = (allClients || []).filter((client) => {
        if (!targetUserId) return true; // "Todos": sem filtro

        if (instanceId) {
          // Aba de instância explícita: mostra apenas clientes cuja ÚLTIMA
          // mensagem veio desta instância (ownership dinâmico — handoff automático)
          return lastInstancePerClient.get(client.id) === instanceId;
        }

        // Aba de usuário: mostra apenas clientes atribuídos a este usuário
        // (via clients.assigned_to ou tickets.assigned_to)
        return clientOwnerMap.get(client.id) === targetUserId;
      });

      if (!clients.length) return [];

      // ── Step 7: monta mapa client_id → client ──
      const clientMap = new Map<string, typeof clients[number]>(
        (clients || []).map((c) => [c.id, c])
      );

      // ── Step 8: agrega por cliente ──
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
            assigned_to: clientOwnerMap.get(client.id) ?? client.assigned_to ?? null,
            last_instance_id: lastInstancePerClient.get(client.id) ?? null,
          });
        } else if (isUnread) {
          const conv = map.get(msg.client_id)!;
          conv.unread_count += 1;
        }
      }

      // ── Step 9: deduplica por telefone (últimos 8 dígitos) ──
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
