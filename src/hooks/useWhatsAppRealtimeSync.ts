// src/hooks/useWhatsAppRealtimeSync.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWhatsAppRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-global-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
          qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
