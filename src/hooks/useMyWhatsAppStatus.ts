import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WaState = "open" | "close" | "connecting" | null;

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos

export function useMyWhatsAppStatus(userId: string | undefined) {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [state, setState] = useState<WaState>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (!instanceId) return;

    const check = async () => {
      const { data } = await supabase
        .from("pipeline_whatsapp_instances" as any)
        .select("extension_last_ping")
        .eq("id", instanceId)
        .maybeSingle();

      const ping = (data as any)?.extension_last_ping ?? null;
      if (!ping) {
        setState("close");
        return;
      }
      const age = Date.now() - new Date(ping).getTime();
      setState(age < ONLINE_THRESHOLD_MS ? "open" : "close");
    };

    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [instanceId]);

  return { state, instanceId };
}
