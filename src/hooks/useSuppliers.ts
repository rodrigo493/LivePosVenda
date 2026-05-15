// src/hooks/useSuppliers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Supplier } from "@/types/purchaseOrder";

const sb = supabase as any;

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await sb.from("suppliers").select("*").order("nome", { ascending: true });
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useSupplierByNomusId(nomusPessoaId?: number | null) {
  return useQuery({
    queryKey: ["supplier-by-nomus", nomusPessoaId],
    enabled: !!nomusPessoaId,
    queryFn: async () => {
      const { data, error } = await sb.from("suppliers").select("*").eq("nomus_pessoa_id", nomusPessoaId).maybeSingle();
      if (error) throw error;
      return (data as Supplier) ?? null;
    },
  });
}

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Supplier> & { nomus_pessoa_id: number; nome: string }) => {
      const { data, error } = await sb
        .from("suppliers")
        .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "nomus_pessoa_id" })
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}
