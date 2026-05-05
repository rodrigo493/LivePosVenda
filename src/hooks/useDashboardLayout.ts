import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_LAYOUT, LayoutItem } from "@/constants/dashboardLayout";

export function useDashboardLayout() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-layout", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_dashboard_layouts")
        .select("layout")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.layout as LayoutItem[] | null;
    },
  });

  const savedLayout = (data ?? []) as LayoutItem[];
  const savedKeys = new Set(savedLayout.map((item) => item.i));
  const missingItems = DEFAULT_LAYOUT.filter((item) => !savedKeys.has(item.i));
  const currentLayout: LayoutItem[] =
    savedLayout.length > 0 ? [...savedLayout, ...missingItems] : DEFAULT_LAYOUT;

  const { mutateAsync: saveLayout, isPending: isSaving } = useMutation({
    mutationFn: async (layout: LayoutItem[]) => {
      const { error } = await supabase
        .from("user_dashboard_layouts")
        .upsert(
          { user_id: user!.id, layout, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["dashboard-layout", user?.id] }),
  });

  const { mutateAsync: resetLayout, isPending: isResetting } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("user_dashboard_layouts")
        .delete()
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["dashboard-layout", user?.id] }),
  });

  return { currentLayout, isLoading, saveLayout, resetLayout, isSaving, isResetting };
}
