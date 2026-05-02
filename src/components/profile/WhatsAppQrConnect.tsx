import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Instance {
  id: string;
  instance_name: string;
  phone_number: string | null;
}

interface StatusResponse {
  state: "open" | "close" | "connecting";
  qrcode: string | null;
  phone: string | null;
}

async function fetchInstanceStatus(instanceId: string): Promise<StatusResponse> {
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
      body: JSON.stringify({ instance_id: instanceId }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Erro ${res.status}`);
  }
  return res.json();
}

export function WhatsAppQrConnect({ instance }: { instance: Instance }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wasConnected = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const poll = useCallback(async () => {
    try {
      const result = await fetchInstanceStatus(instance.id);
      setStatus(result);
      setError(null);

      if (result.state === "open" && !wasConnected.current) {
        wasConnected.current = true;
        toast.success(
          result.phone
            ? `WhatsApp conectado! Número: ${result.phone}`
            : "WhatsApp conectado com sucesso!"
        );
        stopPolling();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao verificar status");
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, 3_000);
    return stopPolling;
  }, [poll]);

  const retry = () => {
    setError(null);
    setLoading(true);
    wasConnected.current = false;
    poll();
    if (!intervalRef.current) {
      intervalRef.current = setInterval(poll, 3_000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Meu WhatsApp</h3>
          <span className="text-xs text-muted-foreground">· {instance.instance_name}</span>
        </div>
        {status && <StatusBadge state={status.state} />}
      </div>

      {/* Loading inicial */}
      {loading && !status && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Verificando conexão...
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 space-y-2">
          <p className="text-sm text-destructive">
            Não foi possível conectar ao servidor WhatsApp. {error}
          </p>
          <Button variant="outline" size="sm" onClick={retry} className="text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </Button>
        </div>
      )}

      {/* Conectado */}
      {!error && status?.state === "open" && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-800">WhatsApp conectado com sucesso!</p>
          {status.phone && (
            <p className="text-xs text-emerald-700 mt-1">
              Número: <span className="font-mono">{status.phone}</span>
            </p>
          )}
        </div>
      )}

      {/* QR Code (desconectado ou conectando) */}
      {!error && status && status.state !== "open" && (
        <>
          {status.qrcode ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Escaneie o QR code abaixo com seu WhatsApp para conectar:
              </p>
              <div className="inline-block p-3 bg-white rounded-xl border shadow-sm">
                <img
                  src={
                    status.qrcode.startsWith("data:") || status.qrcode.startsWith("http")
                      ? status.qrcode
                      : `data:image/png;base64,${status.qrcode}`
                  }
                  alt="QR Code WhatsApp"
                  className="h-48 w-48"
                />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1 max-w-xs">
                <p className="font-medium text-foreground">Como escanear:</p>
                <p>1. Abra o WhatsApp no seu celular</p>
                <p>2. Toque em <strong>Aparelhos conectados</strong></p>
                <p>3. Toque em <strong>Conectar aparelho</strong></p>
                <p>4. Aponte a câmera para o QR code acima</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              Aguardando QR code...
            </p>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: "open" | "close" | "connecting" }) {
  if (state === "open")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Conectado
      </span>
    );
  if (state === "connecting")
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
        Conectando...
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      Desconectado
    </span>
  );
}
