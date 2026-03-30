import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ServiceHistoryRecord {
  id: string;
  client_id: string;
  service_date: string;
  device: string | null;
  problem_reported: string | null;
  solution_provided: string | null;
  service_status: string;
}

export function useAllServiceHistory() {
  return useQuery({
    queryKey: ["all_service_history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_service_history")
        .select("id, client_id, service_date, device, problem_reported, solution_provided, service_status")
        .order("service_date", { ascending: false });
      if (error) throw error;
      return data as ServiceHistoryRecord[];
    },
  });
}
