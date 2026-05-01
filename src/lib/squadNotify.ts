import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type NotifySquadParams = {
  recordType: "pa" | "pg";
  recordId: string;
  reference: string;
  message?: string;
};

export async function notifySquad({ recordType, recordId, reference, message }: NotifySquadParams): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("squad-notify", {
      body: { record_type: recordType, record_id: recordId, reference, ...(message ? { message } : {}) },
    });
    if (error) throw new Error(error.message);
    if (data && data.success === false) throw new Error(data.error || "Squad recusou a requisição");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Falha ao notificar Squad";
    if (import.meta.env.DEV) console.error("[squad-notify]", err);
    toast.warning(`Squad não foi notificado: ${msg}`);
    return false;
  }
}
