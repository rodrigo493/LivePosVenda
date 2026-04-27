// src/hooks/useCrmPermissions.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCrmModulePermissions(userId: string | null) {
  return useQuery({
    queryKey: ["crm-module-permissions", userId],
    enabled: !!userId,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("crm_module_permissions")
        .select("module_key")
        .eq("user_id", userId);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.module_key as string));
    },
    staleTime: 30_000,
  });
}

export function useSaveCrmPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, grantedKeys }: { userId: string; grantedKeys: string[] }) => {
      await (supabase as any)
        .from("crm_module_permissions")
        .delete()
        .eq("user_id", userId);
      if (grantedKeys.length > 0) {
        const { error } = await (supabase as any)
          .from("crm_module_permissions")
          .insert(grantedKeys.map((key) => ({ user_id: userId, module_key: key })));
        if (error) throw error;
      }
    },
    onSuccess: (_: void, vars: { userId: string }) => {
      qc.invalidateQueries({ queryKey: ["crm-module-permissions", vars.userId] });
      qc.invalidateQueries({ queryKey: ["my-crm-permissions"] });
      toast.success("Permissões salvas");
    },
    onError: () => toast.error("Erro ao salvar permissões"),
  });
}
