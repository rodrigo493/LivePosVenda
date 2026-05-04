import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface UserWhatsAppInstance {
  id: string;
  instance_name: string;
  pipeline_id: string;
  pipeline_name: string;
}

export function useUserWhatsAppInstances() {
  const { user } = useAuth();

  return useQuery<UserWhatsAppInstance[]>({
    queryKey: ["user-whatsapp-instances", user?.id],
    staleTime: 300_000,
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_whatsapp_instances")
        .select("id, instance_name, pipeline_id, pipelines(name)")
        .eq("user_id", user!.id)
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        instance_name: r.instance_name as string,
        pipeline_id: r.pipeline_id as string,
        pipeline_name: (r.pipelines?.name ?? r.instance_name) as string,
      }));
    },
  });
}
