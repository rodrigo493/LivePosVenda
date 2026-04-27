// src/hooks/usePipelines.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Pipeline {
  id: string;
  name: string;
  slug: string;
  position: number;
  is_active: boolean;
  created_at: string;
}

export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipelines")
        .select("id, name, slug, position, is_active, created_at")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as Pipeline[];
    },
    staleTime: 30_000,
  });
}
