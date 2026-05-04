import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WaState = "open" | "close" | "connecting" | null;

async function getStatus(instanceId: string): Promise<WaState> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-instance-status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ instance_id: instanceId, skip_connect: true }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.state ?? null;
}

// Polling de 30s para o header — retorna estado e instance_id do usuário logado
export function useMyWhatsAppStatus(userId: string | undefined) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [state, setState] = useState<WaState>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Busca a instância vinculada ao usuário
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("pipeline_whatsapp_instances" as any)
      .select("id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setInstanceId((data as any)?.id ?? null));
  }, [userId]);

  // Inicia polling quando instanceId estiver disponível
  useEffect(() => {
    if (!instanceId) return;

    const check = async () => {
      const s = await getStatus(instanceId);
      if (s !== null) setState(s);
    };

    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [instanceId]);

  return { state, instanceId };
}
