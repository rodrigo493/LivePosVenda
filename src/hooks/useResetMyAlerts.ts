import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      // Sempre zera apenas os alertas do usuário atual (cada usuário tem seus próprios alertas)
      const { error } = await (supabase as any).rpc("reset_my_alerts");
      if (error) throw error;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["overdue-tasks-count"] }),
        qc.invalidateQueries({ queryKey: ["new-leads"] }),
        qc.invalidateQueries({ queryKey: ["whatsapp-unread"] }),
      ]);

      toast.success("Alertas zerados com sucesso");
    } catch (err: any) {
      console.error("[useResetMyAlerts] erro ao zerar alertas:", err);
      toast.error("Erro ao zerar alertas: " + (err?.message ?? "tente novamente"));
    } finally {
      setIsResetting(false);
    }
  };

  return { reset, isResetting };
}
