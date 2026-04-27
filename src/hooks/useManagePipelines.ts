// src/hooks/useManagePipelines.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function useCreatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const slug = toSlug(name) + "-" + Date.now().toString(36);
      const { data, error } = await (supabase as any)
        .from("pipelines")
        .insert({ name, slug, position: 999 })
        .select("id, name, slug, position, is_active, created_at")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Funil criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar funil"),
  });
}

export function useUpdatePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await (supabase as any)
        .from("pipelines")
        .update({ name })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      toast.success("Funil atualizado");
    },
    onError: () => toast.error("Erro ao atualizar funil"),
  });
}

export function useDeletePipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count: ticketCount, error: ticketErr } = await (supabase as any)
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_id", id);
      if (ticketErr) throw ticketErr;
      if ((ticketCount ?? 0) > 0)
        throw new Error(`Não é possível excluir — há ${ticketCount} ticket(s) neste funil`);

      // Delete stages first (ON DELETE RESTRICT on pipelines)
      const { error: stagesErr } = await (supabase as any)
        .from("pipeline_stages")
        .delete()
        .eq("pipeline_id", id);
      if (stagesErr) throw stagesErr;

      const { error } = await (supabase as any).from("pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipelines"] });
      qc.invalidateQueries({ queryKey: ["pipeline-stages"] });
      toast.success("Funil excluído");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
