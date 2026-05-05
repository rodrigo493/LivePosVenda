import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface MyProfile {
  full_name: string;
  email: string | null;
  phone: string | null;
}

export function useMyProfile() {
  const { user } = useAuth();

  return useQuery<MyProfile | null>({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("full_name, email, phone")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data as MyProfile | null) ?? null;
    },
  });
}
