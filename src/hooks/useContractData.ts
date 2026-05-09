import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ContractInstallment } from "@/lib/generateContractPdf";

export type { ContractInstallment };

export function useSaveContractData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pdId,
      bairro,
      installments,
    }: {
      pdId: string;
      bairro: string;
      installments: ContractInstallment[];
    }) => {
      const { error } = await supabase
        .from("service_requests")
        .update({
          contract_bairro: bairro,
          contract_installments: installments as any,
        })
        .eq("id", pdId);
      if (error) throw error;
    },
    onSuccess: (_, { pdId }) => {
      qc.invalidateQueries({ queryKey: ["service-request", pdId] });
    },
  });
}
