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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
          if ((payload.new as any)?.new_lead === true) {
            qc.invalidateQueries({ queryKey: ["new-leads"] });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        (payload) => {
          if ((payload.old as any)?.new_lead === true && (payload.new as any)?.new_lead === false) {
            qc.invalidateQueries({ queryKey: ["new-leads"] });
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
