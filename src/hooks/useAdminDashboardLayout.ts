import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_ADMIN_LAYOUT, AdminLayoutItem } from "@/constants/adminDashboardLayout";

export type AdminColors = Record<string, string | null>;

export function useAdminDashboardLayout() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard-layout", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("user_admin_dashboard_layouts")
        .select("layout, colors")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { layout: AdminLayoutItem[]; colors: AdminColors } | null;
    },
  });

  const savedLayout = (data?.layout ?? []) as AdminLayoutItem[];
  const savedKeys = new Set(savedLayout.map((item) => item.i));
  const missingItems = DEFAULT_ADMIN_LAYOUT.filter((item) => !savedKeys.has(item.i));
  const currentLayout: AdminLayoutItem[] =
    savedLayout.length > 0 ? [...savedLayout, ...missingItems] : DEFAULT_ADMIN_LAYOUT;
  const currentColors: AdminColors = (data?.colors ?? {}) as AdminColors;

  const { mutateAsync: saveLayout, isPending: isSaving } = useMutation({
    mutationFn: async ({ layout, colors }: { layout: AdminLayoutItem[]; colors: AdminColors }) => {
      const { error } = await (supabase as any)
        .from("user_admin_dashboard_layouts")
        .upsert(
          { user_id: user!.id, layout, colors, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-dashboard-layout", user?.id] }),
  });

  const { mutateAsync: resetLayout, isPending: isResetting } = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("user_admin_dashboard_layouts")
        .delete()
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-dashboard-layout", user?.id] }),
  });

  return { currentLayout, currentColors, isLoading, saveLayout, resetLayout, isSaving, isResetting };
}
