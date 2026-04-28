import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AutomationActionType =
  | "whatsapp_message"
  | "create_task"
  | "notify_user"
  | "move_stage"
  | "send_email";

export interface StageAutomation {
  id: string;
  stage_id: string;
  trigger_type: string;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  position: number;
  is_active: boolean;
  delay_minutes: number;
}

export function usePipelineAutomations(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ["pipeline-automations", pipelineId],
    enabled: !!pipelineId,
    staleTime: 30_000,
    queryFn: async (): Promise<StageAutomation[]> => {
      const { data, error } = await (supabase as any)
        .from("pipeline_stage_automations")
        .select("*, pipeline_stages!inner(pipeline_id)")
        .eq("pipeline_stages.pipeline_id", pipelineId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        stage_id: row.stage_id,
        trigger_type: row.trigger_type,
        action_type: row.action_type as AutomationActionType,
        action_config: row.action_config ?? {},
        position: row.position,
        is_active: row.is_active,
        delay_minutes: row.delay_minutes ?? 0,
      }));
    },
  });
}

export function useSaveStageAutomations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      stageId,
      pipelineId,
      automations,
    }: {
      stageId: string;
      pipelineId: string;
      automations: Omit<StageAutomation, "id" | "stage_id">[];
    }) => {
      await (supabase as any)
        .from("pipeline_stage_automations")
        .delete()
        .eq("stage_id", stageId);

      if (automations.length > 0) {
        const { error } = await (supabase as any)
          .from("pipeline_stage_automations")
          .insert(
            automations.map((a, i) => ({
              stage_id: stageId,
              trigger_type: a.trigger_type,
              action_type: a.action_type,
              action_config: a.action_config,
              position: i,
              is_active: a.is_active,
              delay_minutes: a.delay_minutes ?? 0,
            }))
          );
        if (error) throw error;
      }
    },
    onSuccess: (_data: void, vars: { pipelineId: string }) => {
      qc.invalidateQueries({ queryKey: ["pipeline-automations", vars.pipelineId] });
    },
  });
}
