import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWhatsAppAvatar(
  clientId: string | undefined,
  phone: string | null | undefined,
  instanceId: string | null | undefined
) {
  return useQuery<string | null>({
    queryKey: ["whatsapp-avatar", clientId],
    enabled: !!clientId && !!phone,
    staleTime: 60 * 60_000, // 1 hora
    queryFn: async () => {
      // 1. Tenta retornar o que já está salvo no banco
      const { data: client } = await (supabase as any)
        .from("clients")
        .select("avatar_url")
        .eq("id", clientId!)
        .maybeSingle();

      if ((client as any)?.avatar_url) return (client as any).avatar_url as string;

      // 2. Não tem → busca na Uazapi via Edge Function
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) return null;

      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-whatsapp-avatar`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ client_id: clientId, phone, instance_id: instanceId }),
          }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return (data.url as string | null) ?? null;
      } catch {
        return null;
      }
    },
  });
}
