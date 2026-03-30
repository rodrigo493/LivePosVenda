import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTemplateParts(templateId: string | undefined) {
  return useQuery({
    queryKey: ["maintenance_template_parts", templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_template_parts")
        .select("*, products(code, name)")
        .eq("template_id", templateId!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });
}

export function useAddTemplatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (part: { template_id: string; product_id: string; quantity: number; notes?: string }) => {
      const { data, error } = await supabase.from("maintenance_template_parts").insert(part).select("*, products(code, name)").single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["maintenance_template_parts", vars.template_id] }),
  });
}

export function useRemoveTemplatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, templateId }: { id: string; templateId: string }) => {
      const { error } = await supabase.from("maintenance_template_parts").delete().eq("id", id);
      if (error) throw error;
      return templateId;
    },
    onSuccess: (templateId) => qc.invalidateQueries({ queryKey: ["maintenance_template_parts", templateId] }),
  });
}
