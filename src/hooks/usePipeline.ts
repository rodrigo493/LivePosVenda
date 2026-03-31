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
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name)), quotes(quote_number, status)")
        .not("status", "eq", "fechado")
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
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const now = new Date().toISOString();

      // If moving to "concluido", close the ticket
      if (stage === "concluido") {
        const { error } = await supabase
          .from("tickets")
          .update({
            pipeline_stage: stage,
            status: "fechado" as any,
            closed_at: now,
            last_interaction_at: now,
            updated_at: now,
          })
          .eq("id", id);
        if (error) throw error;

        // Create history record for the client
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
        const { error } = await supabase
          .from("tickets")
          .update({ pipeline_stage: stage, updated_at: now })
          .eq("id", id);
        if (error) throw error;
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
