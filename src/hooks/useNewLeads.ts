import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NewLead {
  id: string;
  title: string;
  created_at: string;
  clients: { name: string } | null;
}

export function useNewLeads() {
  return useQuery<NewLead[]>({
    queryKey: ["new-leads"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .select("id, title, created_at, clients(name)")
        .eq("new_lead", true)
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
  const qc = useQueryClient();
  return async () => {
    await (supabase as any)
      .from("tickets")
      .update({ new_lead: false })
      .eq("new_lead", true);
    qc.invalidateQueries({ queryKey: ["new-leads"] });
    qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
  };
}
