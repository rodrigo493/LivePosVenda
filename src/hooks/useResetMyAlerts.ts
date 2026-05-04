import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useResetMyAlerts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const reset = async () => {
    if (!user?.id || isResetting) return;
    setIsResetting(true);
    try {
      const { error } = await (supabase as any).rpc("reset_my_alerts");
      if (error) throw error;

      // Invalida todas as queries de alertas
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["unanswered-ack"] }),
        qc.invalidateQueries({ queryKey: ["overdue-tasks-count"] }),
        qc.invalidateQueries({ queryKey: ["new-leads"] }),
        qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] }),
      ]);
    } finally {
      setIsResetting(false);
    }
  };

  return { reset, isResetting };
}
