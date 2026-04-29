import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NegotiationItem {
  id: string;
  ticket_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  created_at: string;
  updated_at: string;
}

const TABLE = "ticket_negotiation_items";
const qk = (ticketId: string) => ["ticket-negotiation-items", ticketId];

export function useTicketNegotiationItems(ticketId: string | undefined) {
  return useQuery({
    queryKey: qk(ticketId ?? ""),
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .eq("ticket_id", ticketId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as NegotiationItem[];
    },
  });
}

export function useAddNegotiationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      ticket_id: string;
      product_id: string | null;
      product_name: string;
      unit_price: number;
      quantity?: number;
    }) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .insert({ ...item, quantity: item.quantity ?? 1 })
        .select()
        .single();
      if (error) throw error;
      return data as NegotiationItem;
    },
    onSuccess: (item) => qc.invalidateQueries({ queryKey: qk(item.ticket_id) }),
  });
}

export function useUpdateNegotiationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ticket_id, ...updates }: Partial<NegotiationItem> & { id: string; ticket_id: string }) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as NegotiationItem;
    },
    onSuccess: (item) => qc.invalidateQueries({ queryKey: qk(item.ticket_id) }),
  });
}

export function useRemoveNegotiationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ticket_id }: { id: string; ticket_id: string }) => {
      const { error } = await (supabase as any).from(TABLE).delete().eq("id", id);
      if (error) throw error;
      return ticket_id;
    },
    onSuccess: (ticket_id) => qc.invalidateQueries({ queryKey: qk(ticket_id) }),
  });
}
