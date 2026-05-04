import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientInsert } from "@/types/database";
import { useAuth } from "@/hooks/useAuth";

export function useClients() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ["clients", isAdmin ? "all" : userId],
    enabled: !!userId,
    queryFn: async () => {
      let query = supabase.from("clients").select("*").order("name");
      // Não-admin vê apenas clientes que criou ou é responsável
      if (!isAdmin && userId) {
        query = (query as any).or(`created_by.eq.${userId},assigned_to.eq.${userId}`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (client: ClientInsert) => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .insert({ ...client, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ClientInsert>) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      // Verifica se há tickets ativos (sem deleted_at)
      const { count, error: checkErr } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .is("deleted_at", null);
      if (checkErr) throw checkErr;
      if (count && count > 0) {
        throw new Error(`ACTIVE_TICKETS:${count}`);
      }
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}
