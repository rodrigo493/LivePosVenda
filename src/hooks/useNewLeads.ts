import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface NewLead {
  id: string;
  title: string;
  created_at: string;
  clients: { name: string } | null;
}

export function useNewLeads() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<NewLead[]>({
    queryKey: ["new-leads", userId],
    staleTime: 30_000,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .select("id, title, created_at, clients(name)")
        .eq("new_lead", true)
        .eq("assigned_to", userId)   // cada usuário (admin inclusive) vê apenas seus leads
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useClearNewLead() {
  const qc = useQueryClient();
  return async (ticketId: string) => {
    await (supabase as any)
      .from("tickets")
      .update({ new_lead: false })
      .eq("id", ticketId);
    qc.invalidateQueries({ queryKey: ["new-leads"] });
    qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
  };
}

export function useClearAllNewLeads() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return async () => {
    if (!user?.id) return;
    await (supabase as any)
      .from("tickets")
      .update({ new_lead: false })
      .eq("new_lead", true)
      .eq("assigned_to", user.id);   // zera apenas os do próprio usuário
    qc.invalidateQueries({ queryKey: ["new-leads"] });
    qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
  };
}
