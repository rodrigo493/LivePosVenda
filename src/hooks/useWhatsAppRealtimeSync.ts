// src/hooks/useWhatsAppRealtimeSync.ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWhatsAppRealtimeSync() {
  const qc = useQueryClient();
  useEffect(() => {
    const ticketsChannel = supabase
      .channel("tickets-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        () => {
          qc.invalidateQueries({ queryKey: ["pipeline-tickets"] });
          qc.invalidateQueries({ queryKey: ["new-leads"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        () => {
          qc.invalidateQueries({ queryKey: ["new-leads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ticketsChannel);
    };
  }, [qc]);
}
