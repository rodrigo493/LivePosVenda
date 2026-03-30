import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WorkOrderInsert, WorkOrderItemInsert } from "@/types/database";

export function useWorkOrders() {
  return useQuery({
    queryKey: ["work_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*, clients(name), equipments(serial_number, equipment_models(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: ["work_orders", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*, clients(name), equipments(serial_number, model_id, equipment_models(name)), work_order_items(*, products(name, code))")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (wo: WorkOrderInsert) => {
      const { data, error } = await supabase.from("work_orders").insert(wo).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_orders"] }),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<WorkOrderInsert>) => {
      const { data, error } = await supabase.from("work_orders").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_orders"] }),
  });
}

export function useAddWorkOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: WorkOrderItemInsert) => {
      const { data, error } = await supabase.from("work_order_items").insert(item).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_orders"] }),
  });
}

export function useUpdateWorkOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; quantity?: number; unit_price?: number; unit_cost?: number }) => {
      const { data, error } = await supabase.from("work_order_items").update(updates as any).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work_orders"] }),
  });
}
