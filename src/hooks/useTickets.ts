import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TicketInsert, TicketType } from "@/types/database";

export function useTickets(type?: TicketType) {
  return useQuery({
    queryKey: ["tickets", type],
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name))")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (type) q = q.eq("ticket_type", type);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ["tickets", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticket: TicketInsert) => {
      let pipeline_id = (ticket as any).pipeline_id;
      if (!pipeline_id) {
        const { data: pipelines } = await supabase
          .from("pipelines")
          .select("id")
          .eq("is_active", true)
          .order("position")
          .limit(1);
        pipeline_id = pipelines?.[0]?.id ?? null;
      }
      const { data, error } = await supabase
        .from("tickets")
        .insert({ ...ticket, pipeline_id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TicketInsert>) => {
      const { data, error } = await supabase.from("tickets").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
    },
  });
}

export function useSoftDeleteTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const { error } = await supabase
        .from("tickets")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
    },
  });
}
