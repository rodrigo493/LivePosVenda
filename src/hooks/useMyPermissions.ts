// src/hooks/useMyPermissions.ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface MyPermissionsResult {
  perms: Set<string> | null;
  isAdmin: boolean;
  loading: boolean;
}

export function useMyPermissions(): MyPermissionsResult {
  const { hasRole, user } = useAuth();
  const isAdmin = hasRole("admin");

  const { data: perms = null, isLoading } = useQuery({
    queryKey: ["my-crm-permissions", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("crm_module_permissions")
        .select("module_key")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set<string>((data || []).map((r: any) => r.module_key as string));
    },
    staleTime: 60_000,
  });

  return {
    perms,
    isAdmin,
    loading: isLoading && !isAdmin,
  };
}
