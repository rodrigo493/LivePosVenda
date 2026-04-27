// src/hooks/usePipeline.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePipelineTickets(pipelineId: string | null | undefined, userId?: string) {
  return useQuery({
    queryKey: ["pipeline-tickets", pipelineId, userId],
    enabled: !!pipelineId,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      let q = (supabase as any)
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name)), quotes(id, quote_number, status, service_request_id, warranty_claim_id)")
        .eq("pipeline_id", pipelineId)
        .not("status", "eq", "fechado")
        .order("pipeline_position", { ascending: true })
        .order("last_interaction_at", { ascending: true });
      if (userId) q = q.eq("assigned_to", userId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useMovePipelineStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      stage,
      position,
      pipelineId,
    }: {
      id: string;
      stage: string;
      position: number;
      pipelineId: string;
    }) => {
      const now = new Date().toISOString();

      const { data: stageTickets } = await (supabase as any)
        .from("tickets")
        .select("id, pipeline_position")
        .eq("pipeline_id", pipelineId)
        .eq("pipeline_stage", stage)
        .neq("id", id)
        .order("pipeline_position", { ascending: true });

      const others = stageTickets || [];
      const updates: { id: string; pipeline_position: number }[] = [];
      let pos = 1;
      let inserted = false;

      for (const t of others) {
        if (pos === position && !inserted) {
          updates.push({ id, pipeline_position: pos });
          pos++;
          inserted = true;
        }
        updates.push({ id: t.id, pipeline_position: pos });
        pos++;
      }
      if (!inserted) updates.push({ id, pipeline_position: pos });

      if (stage === "concluido") {
        const { error } = await (supabase as any)
          .from("tickets")
          .update({
            pipeline_stage: stage,
            pipeline_position: position,
            status: "fechado",
            closed_at: now,
            last_interaction_at: now,
            updated_at: now,
          })
          .eq("id", id);
        if (error) throw error;

        const { data: ticket } = await supabase
          .from("tickets")
          .select("client_id, title, description, internal_notes")
          .eq("id", id)
          .single();
        if (ticket?.client_id) {
          await (supabase as any).from("client_service_history").insert({
            client_id: ticket.client_id,
            service_date: now,
            device: null,
            problem_reported: ticket.description || ticket.title,
            solution_provided: ticket.internal_notes || null,
            service_status: "concluido",
          });
        }
      } else {
        const { error } = await (supabase as any)
          .from("tickets")
          .update({ pipeline_stage: stage, pipeline_position: position, updated_at: now })
          .eq("id", id);
        if (error) throw error;
      }

      for (const u of updates) {
        if (u.id !== id) {
          await (supabase as any)
            .from("tickets")
            .update({ pipeline_position: u.pipeline_position })
            .eq("id", u.id);
        }
      }

      const { data: ticket } = await supabase
        .from("tickets")
        .select("equipment_id")
        .eq("id", id)
        .single();
      if (ticket?.equipment_id) {
        await supabase.from("technical_history").insert({
          equipment_id: ticket.equipment_id,
          event_type: "mudanca_pipeline",
          description: `Pipeline alterado para: ${stage}`,
          reference_type: "ticket",
          reference_id: id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
      qc.invalidateQueries({ queryKey: ["client_service_history"] });
    },
  });
}
