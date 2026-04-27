// src/hooks/usePipelineStages.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineStageDB {
  id: string;
  pipeline_id: string;
  key: string;
  label: string;
  color: string;
  delay_minutes: number;
  position: number;
}

export function usePipelineStages(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ["pipeline-stages", pipelineId],
    enabled: !!pipelineId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_stages")
        .select("id, pipeline_id, key, label, color, delay_minutes, position")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as PipelineStageDB[];
    },
    staleTime: 30_000,
  });
}
