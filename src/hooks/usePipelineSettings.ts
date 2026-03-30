import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PIPELINE_STAGES } from "@/hooks/usePipeline";

export interface PipelineStageConfig {
  key: string;
  label: string;
  color: string;
  delayDays: number;
}

const DEFAULT_DELAYS: Record<string, number> = {
  sem_atendimento: 1,
  primeiro_contato: 2,
  em_analise: 3,
  separacao_pecas: 5,
  concluido: 999,
  sem_interacao: 2,
};

export function usePipelineSettings() {
  return useQuery({
    queryKey: ["pipeline-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value")
        .eq("category", "pipeline");
      if (error) throw error;

      const settingsMap: Record<string, string> = {};
      data?.forEach((s) => {
        try {
          settingsMap[s.key] = JSON.parse(String(s.value));
        } catch {
          settingsMap[s.key] = String(s.value);
        }
      });

      return PIPELINE_STAGES.map((stage) => ({
        key: stage.key,
        label: stage.label,
        color: settingsMap[`pipeline_color_${stage.key}`] || stage.color,
        delayDays: Number(settingsMap[`pipeline_delay_${stage.key}`]) || DEFAULT_DELAYS[stage.key] || 2,
      })) as PipelineStageConfig[];
    },
    staleTime: 60_000,
  });
}

export function getDelayMap(configs?: PipelineStageConfig[]): Record<string, number> {
  const map: Record<string, number> = { ...DEFAULT_DELAYS };
  configs?.forEach((c) => { map[c.key] = c.delayDays; });
  return map;
}
