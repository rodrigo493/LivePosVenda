import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DealCatalogProduct {
  id: string;
  name: string;
  description: string | null;
  base_price: number;
  visible: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "deal_catalog_products";
const QK = ["deal-catalog-products"];

export function useDealCatalogProducts() {
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as DealCatalogProduct[];
    },
    staleTime: 30_000,
  });
}

export function useCreateDealCatalogProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string; base_price: number; visible?: boolean }) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data as DealCatalogProduct;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateDealCatalogProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DealCatalogProduct> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as DealCatalogProduct;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeleteDealCatalogProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from(TABLE)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
