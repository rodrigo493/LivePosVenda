import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useResetMyAlerts() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const qc = useQueryClient();
  const [isResetting, setIsResetting] = useState(false);

  const reset = async () => {
    if (!user?.id || isResetting) return;
    setIsResetting(true);
    try {
      // Admin zera alertas de TODOS os usuários; não-admin zera apenas os seus
      const rpc = isAdmin ? "admin_reset_all_alerts" : "reset_my_alerts";
      const { error } = await (supabase as any).rpc(rpc);
      if (error) throw error;

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
