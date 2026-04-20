import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PIPELINE_STAGES = [
  { key: "sem_atendimento", label: "Sem atendimento", color: "hsl(0 0% 45%)" },
  { key: "primeiro_contato", label: "Primeiro contato", color: "hsl(210 80% 55%)" },
  { key: "em_analise", label: "Em análise", color: "hsl(38 92% 50%)" },
  { key: "separacao_pecas", label: "Separação de peças", color: "hsl(280 60% 55%)" },
  { key: "concluido", label: "Concluído", color: "hsl(142 71% 45%)" },
  { key: "sem_interacao", label: "Sem interação", color: "hsl(0 84% 60%)" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["key"];

export function usePipelineTickets(userId?: string) {
  return useQuery({
    queryKey: ["pipeline-tickets", userId],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name)), quotes(id, quote_number, status, service_request_id, warranty_claim_id)")
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
    mutationFn: async ({ id, stage, position }: { id: string; stage: string; position: number }) => {
      const now = new Date().toISOString();

      // Get all tickets in the target stage to reorder
      const { data: stageTickets } = await (supabase as any)
        .from("tickets")
        .select("id, pipeline_position")
        .eq("pipeline_stage", stage)
        .neq("id", id)
        .order("pipeline_position", { ascending: true });

      // Build new positions: insert the moved ticket at the target position
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
      if (!inserted) {
        updates.push({ id, pipeline_position: pos });
      }

      // If moving to "concluido", close the ticket
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

      // Update positions of other tickets in the stage
      for (const u of updates) {
        if (u.id !== id) {
          await (supabase as any).from("tickets").update({ pipeline_position: u.pipeline_position }).eq("id", u.id);
        }
      }

      // Log in technical_history if equipment exists
      const { data: ticket } = await supabase.from("tickets").select("equipment_id").eq("id", id).single();
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
