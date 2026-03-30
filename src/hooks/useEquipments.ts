import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EquipmentInsert } from "@/types/database";

export function useEquipments() {
  return useQuery({
    queryKey: ["equipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipments")
        .select("*, equipment_models(name, category), clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useEquipment(id: string | undefined) {
  return useQuery({
    queryKey: ["equipments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipments")
        .select("*, equipment_models(name, category), clients(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useEquipmentModels() {
  return useQuery({
    queryKey: ["equipment_models"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment_models").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eq: EquipmentInsert) => {
      const { data, error } = await supabase.from("equipments").insert(eq).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipments"] }),
  });
}

export function useCreateEquipmentModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { data, error } = await supabase.from("equipment_models").insert({ name }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment_models"] }),
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<EquipmentInsert>) => {
      const { data, error } = await supabase.from("equipments").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipments"] }),
  });
}
