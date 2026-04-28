import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminTicket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  pipeline_id: string | null;
  pipeline_stage: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  last_interaction_at: string | null;
  created_by: string | null;
  client_id: string;
  equipment_id: string | null;
  estimated_value: number | null;
  clients?: { name: string } | null;
  equipments?: { serial_number: string; equipment_models?: { name: string } | null } | null;
}

export function useAdminTickets() {
  return useQuery({
    queryKey: ["admin-tickets"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .select(
          "id, ticket_number, title, status, priority, pipeline_id, pipeline_stage, assigned_to, created_at, updated_at, last_interaction_at, created_by, client_id, equipment_id, estimated_value, clients(name), equipments(serial_number, equipment_models(name))"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AdminTicket[];
    },
    staleTime: 30_000,
  });
}
