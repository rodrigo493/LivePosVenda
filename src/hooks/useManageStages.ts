// src/hooks/useManageStages.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PipelineStageDB } from "@/hooks/usePipelineStages";

function toKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") +
    "_" +
    Date.now().toString(36)
  );
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pipelineId,
      label,
      color,
      delayDays,
      position,
    }: {
      pipelineId: string;
      label: string;
      color: string;
      delayDays: number;
      position: number;
    }) => {
      const key = toKey(label);
      const { data, error } = await (supabase as any)
        .from("pipeline_stages")
        .insert({ pipeline_id: pipelineId, key, label, color, delay_days: delayDays, position })
        .select("id, pipeline_id, key, label, color, delay_days, position")
        .single();
      if (error) throw error;
      return data as PipelineStageDB;
    },
    onSuccess: (_data: PipelineStageDB, vars: { pipelineId: string }) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
      toast.success("Etapa criada");
    },
    onError: () => toast.error("Erro ao criar etapa"),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      pipelineId,
      label,
      color,
      delayDays,
    }: {
      id: string;
      pipelineId: string;
      label: string;
      color: string;
      delayDays: number;
    }) => {
      const { error } = await (supabase as any)
        .from("pipeline_stages")
        .update({ label, color, delay_days: delayDays })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data: void, vars: { pipelineId: string }) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
      toast.success("Etapa atualizada");
    },
    onError: () => toast.error("Erro ao atualizar etapa"),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pipelineId }: { id: string; pipelineId: string }) => {
      // Fetch the stage key first
      const { data: stageData, error: fetchErr } = await (supabase as any)
        .from("pipeline_stages")
        .select("key")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { count, error: countErr } = await (supabase as any)
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", pipelineId)
        .eq("pipeline_stage", stageData.key);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0)
        throw new Error(`Não é possível excluir — há ${count} ticket(s) nesta etapa`);

      const { error } = await (supabase as any)
        .from("pipeline_stages")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data: void, vars: { pipelineId: string }) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
      toast.success("Etapa excluída");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pipelineId,
      stages,
    }: {
      pipelineId: string;
      stages: { id: string; position: number }[];
    }) => {
      await Promise.all(
        stages.map(({ id, position }) =>
          (supabase as any).from("pipeline_stages").update({ position }).eq("id", id)
        )
      );
    },
    onSuccess: (_data: void, vars: { pipelineId: string }) => {
      qc.invalidateQueries({ queryKey: ["pipeline-stages", vars.pipelineId] });
    },
    onError: () => toast.error("Erro ao reordenar etapas"),
  });
}
