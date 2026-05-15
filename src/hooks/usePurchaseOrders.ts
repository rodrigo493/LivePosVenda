// src/hooks/usePurchaseOrders.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/purchaseOrder";

const sb = supabase as any;

export function usePurchaseOrders(ticketId?: string | null) {
  return useQuery({
    queryKey: ["purchase-orders", ticketId ?? "all"],
    queryFn: async () => {
      let q = sb.from("purchase_orders").select("*").order("created_at", { ascending: false });
      if (ticketId) q = q.eq("ticket_id", ticketId);
      const { data, error } = await q;
      if (error) throw error;
      return data as PurchaseOrder[];
    },
  });
}

export function usePurchaseOrder(id?: string) {
  return useQuery({
    queryKey: ["purchase-order", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from("purchase_orders").select("*").eq("id", id).single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
  });
}

export function usePurchaseOrderItems(purchaseOrderId?: string) {
  return useQuery({
    queryKey: ["purchase-order-items", purchaseOrderId],
    enabled: !!purchaseOrderId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", purchaseOrderId)
        .order("posicao", { ascending: true });
      if (error) throw error;
      return data as PurchaseOrderItem[];
    },
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ticket_id?: string | null; created_by?: string | null }) => {
      const { data: num } = await sb.rpc("generate_pc_number");
      const { data, error } = await sb
        .from("purchase_orders")
        .insert({ order_number: num ?? `PC-${Date.now()}`, ticket_id: input.ticket_id ?? null, created_by: input.created_by ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PurchaseOrder>) => {
      const { data, error } = await sb
        .from("purchase_orders")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-order", d.id] });
    },
  });
}

export function useAddPurchaseOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<PurchaseOrderItem>) => {
      const { data, error } = await sb.from("purchase_order_items").insert(item).select().single();
      if (error) throw error;
      return data as PurchaseOrderItem;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["purchase-order-items", d.purchase_order_id] }),
  });
}

export function useUpdatePurchaseOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PurchaseOrderItem>) => {
      const { data, error } = await sb.from("purchase_order_items").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data as PurchaseOrderItem;
    },
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ["purchase-order-items", d.purchase_order_id] }),
  });
}

export function useDeletePurchaseOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; purchase_order_id: string }) => {
      const { error } = await sb.from("purchase_order_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["purchase-order-items", vars.purchase_order_id] }),
  });
}
