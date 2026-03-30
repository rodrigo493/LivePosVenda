import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useProductCompatibility(productId: string | undefined) {
  return useQuery({
    queryKey: ["product_compatibility", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_compatibility")
        .select("*, equipment_models(id, name)")
        .eq("product_id", productId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useModelCompatibleProducts(modelId: string | undefined) {
  return useQuery({
    queryKey: ["model_compatible_products", modelId],
    enabled: !!modelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_compatibility")
        .select("product_id, products(id, code, name, base_cost, compatibility, product_group, family, margin_percent, ipi_percent, icms_percent, pis_percent, cofins_percent, csll_percent, irpj_percent, unit, status)")
        .eq("model_id", modelId!);
      if (error) throw error;
      return data?.map((d: any) => ({ ...d.products, _compatProductId: d.product_id })).filter(Boolean) || [];
    },
  });
}

export function useSetProductCompatibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, modelIds }: { productId: string; modelIds: string[] }) => {
      // Delete existing
      const { error: delError } = await supabase
        .from("product_compatibility")
        .delete()
        .eq("product_id", productId);
      if (delError) throw delError;

      // Insert new
      if (modelIds.length > 0) {
        const rows = modelIds.map((model_id) => ({ product_id: productId, model_id }));
        const { error: insError } = await supabase
          .from("product_compatibility")
          .insert(rows);
        if (insError) throw insError;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["product_compatibility", vars.productId] });
      qc.invalidateQueries({ queryKey: ["model_compatible_products"] });
    },
  });
}

export function useEquipmentModels() {
  return useQuery({
    queryKey: ["equipment_models"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_models")
        .select("id, name, category")
        .eq("status", "ativo")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

// Get all compatibility mappings (product_id -> model_id[]) for search use
export function useAllCompatibility() {
  return useQuery({
    queryKey: ["all_product_compatibility"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_compatibility")
        .select("product_id, model_id, equipment_models(name)");
      if (error) throw error;
      // Build map: product_id -> model names
      const map: Record<string, string[]> = {};
      for (const row of data || []) {
        if (!map[row.product_id]) map[row.product_id] = [];
        const modelName = (row as any).equipment_models?.name;
        if (modelName) map[row.product_id].push(modelName);
      }
      return map;
    },
  });
}
