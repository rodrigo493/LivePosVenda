import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserAlertSummary {
  userId: string;
  userName: string;
  newLeads: number;
  overdueTasks: number;
  unreadMessages: number;
}

export function useTeamAlerts() {
  return useQuery<UserAlertSummary[]>({
    queryKey: ["team-alerts"],
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // Busca todos em paralelo
      const [profilesRes, leadsRes, tasksRes, messagesRes] = await Promise.all([
        (supabase as any).from("profiles").select("id, full_name"),
        (supabase as any)
          .from("tickets")
          .select("assigned_to")
          .eq("new_lead", true)
          .is("deleted_at", null)
          .not("assigned_to", "is", null),
        (supabase as any)
          .from("tasks")
          .select("assigned_to")
          .neq("status", "concluida")
          .not("due_date", "is", null)
          .lt("due_date", today)
          .not("assigned_to", "is", null),
        // Mensagens não lidas: inbound mais recentes que whatsapp_last_read_at do cliente
        (supabase as any)
          .from("whatsapp_messages")
          .select("clients!inner(assigned_to, whatsapp_last_read_at)")
          .eq("direction", "inbound")
          .gte("created_at", thirtyDaysAgo)
          .not("clients.assigned_to", "is", null),
      ]);

      const profiles: { id: string; full_name: string | null }[] = profilesRes.data ?? [];

      // Conta new leads por usuário
      const leadsByUser = new Map<string, number>();
      for (const row of leadsRes.data ?? []) {
        if (row.assigned_to) leadsByUser.set(row.assigned_to, (leadsByUser.get(row.assigned_to) ?? 0) + 1);
      }

      // Conta tarefas atrasadas por usuário
      const tasksByUser = new Map<string, number>();
      for (const row of tasksRes.data ?? []) {
        if (row.assigned_to) tasksByUser.set(row.assigned_to, (tasksByUser.get(row.assigned_to) ?? 0) + 1);
      }

      // Conta mensagens não lidas por usuário (usando whatsapp_last_read_at do cliente)
      const unreadByUser = new Map<string, number>();
      for (const row of messagesRes.data ?? []) {
        const client = row.clients as any;
        if (!client?.assigned_to) continue;
        const lastReadAt = client.whatsapp_last_read_at ? new Date(client.whatsapp_last_read_at).getTime() : null;
        const msgTime = new Date(row.created_at ?? Date.now()).getTime();
        const isUnread = lastReadAt === null || msgTime > lastReadAt;
        if (isUnread) {
          unreadByUser.set(client.assigned_to, (unreadByUser.get(client.assigned_to) ?? 0) + 1);
        }
      }

      // Monta resultado — inclui apenas usuários com ao menos 1 alerta
      const result: UserAlertSummary[] = [];
      for (const profile of profiles) {
        const newLeads = leadsByUser.get(profile.id) ?? 0;
        const overdueTasks = tasksByUser.get(profile.id) ?? 0;
        const unreadMessages = unreadByUser.get(profile.id) ?? 0;
        if (newLeads + overdueTasks + unreadMessages === 0) continue;
        result.push({
          userId: profile.id,
          userName: profile.full_name ?? "Usuário",
          newLeads,
          overdueTasks,
          unreadMessages,
        });
      }

      return result.sort((a, b) =>
        (b.newLeads + b.overdueTasks + b.unreadMessages) -
        (a.newLeads + a.overdueTasks + a.unreadMessages)
      );
    },
  });
}
