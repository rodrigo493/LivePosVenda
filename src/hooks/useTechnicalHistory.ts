import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTechnicalHistory(equipmentId: string | undefined) {
  return useQuery({
    queryKey: ["technical_history", equipmentId],
    enabled: !!equipmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("technical_history")
        .select("*")
        .eq("equipment_id", equipmentId!)
        .order("event_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddTechnicalHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      equipment_id: string;
      event_type: string;
      description: string;
      reference_type?: string;
      reference_id?: string;
      performed_by?: string;
      metadata?: any;
    }) => {
      const { data, error } = await supabase.from("technical_history").insert(entry).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["technical_history", vars.equipment_id] }),
  });
}

// Helper to log technical events from other hooks
export async function logTechnicalEvent(params: {
  equipment_id: string;
  event_type: string;
  description: string;
  reference_type?: string;
  reference_id?: string;
  performed_by?: string;
}) {
  await supabase.from("technical_history").insert(params);
}
