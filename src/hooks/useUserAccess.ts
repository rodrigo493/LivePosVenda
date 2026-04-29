// src/hooks/useUserAccess.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserSummary {
  user_id: string;
  full_name: string;
  email: string;
  isAdmin?: boolean;
}

export interface UserAccessData {
  pipelineIds: Set<string>;
  stageIds: Set<string>;
}

export function useAllUsers() {
  return useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data: profiles, error } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name", { ascending: true });
      if (error) throw error;

      const { data: adminRoles } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = new Set((adminRoles || []).map((r: any) => r.user_id as string));

      return (profiles as UserSummary[]).map((u) => ({ ...u, isAdmin: adminIds.has(u.user_id) }));
    },
    staleTime: 60_000,
  });
}

export function useUserAccess(userId: string | null) {
  return useQuery({
    queryKey: ["user-access", userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserAccessData> => {
      const [{ data: pua }, { data: psua }] = await Promise.all([
        (supabase as any)
          .from("pipeline_user_access")
          .select("pipeline_id")
          .eq("user_id", userId),
        (supabase as any)
          .from("pipeline_stage_user_access")
          .select("stage_id")
          .eq("user_id", userId),
      ]);
      return {
        pipelineIds: new Set((pua || []).map((r: any) => r.pipeline_id as string)),
        stageIds: new Set((psua || []).map((r: any) => r.stage_id as string)),
      };
    },
  });
}

export function useSaveUserAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      pipelineIds,
      stageIds,
    }: {
      userId: string;
      pipelineIds: string[];
      stageIds: string[];
    }) => {
      await Promise.all([
        (supabase as any).from("pipeline_user_access").delete().eq("user_id", userId),
        (supabase as any).from("pipeline_stage_user_access").delete().eq("user_id", userId),
      ]);

      if (pipelineIds.length > 0) {
        const { error } = await (supabase as any)
          .from("pipeline_user_access")
          .insert(pipelineIds.map((pid) => ({ user_id: userId, pipeline_id: pid })));
        if (error) throw error;
      }

      if (stageIds.length > 0) {
        const { error } = await (supabase as any)
          .from("pipeline_stage_user_access")
          .insert(stageIds.map((sid) => ({ user_id: userId, stage_id: sid })));
        if (error) throw error;
      }
    },
    onSuccess: (_data: void, vars: { userId: string }) => {
      qc.invalidateQueries({ queryKey: ["user-access", vars.userId] });
      toast.success("Acesso salvo com sucesso");
    },
    onError: () => toast.error("Erro ao salvar acesso"),
  });
}
