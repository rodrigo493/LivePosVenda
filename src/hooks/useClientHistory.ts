import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientServiceHistory {
  id: string;
  client_id: string;
  service_date: string;
  device: string | null;
  problem_reported: string | null;
  solution_provided: string | null;
  service_status: string;
  created_by: string | null;
  created_at: string;
}

export function useClientHistory(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_service_history", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_service_history")
        .select("*")
        .eq("client_id", clientId!)
        .order("service_date", { ascending: false });
      if (error) throw error;
      return data as ClientServiceHistory[];
    },
  });
}

export function useCreateClientHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (records: Omit<ClientServiceHistory, "id" | "created_at">[]) => {
      const { data, error } = await (supabase as any)
        .from("client_service_history")
        .insert(records)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_service_history"] }),
  });
}

export function useUpdateClientHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ClientServiceHistory> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("client_service_history")
        .update(updates)
        .eq("id", id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client_service_history"] }),
  });
}
