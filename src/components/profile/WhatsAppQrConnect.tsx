import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, RefreshCw, Wifi } from "lucide-react";
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

async function fetchInstanceStatus(instanceId: string, skipConnect = false): Promise<StatusResponse> {
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
      body: JSON.stringify({ instance_id: instanceId, skip_connect: skipConnect }),
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
  // "idle" = ainda não tentou conectar | "connecting" = buscando QR | "done" = conectado
  const [mode, setMode] = useState<"idle" | "connecting" | "done">("idle");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wasConnected = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks if QR was received; prevents /instance/connect from being called again
  // on every poll (which would reset the QR session and invalidate the code)
  const hasQrRef = useRef(false);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const poll = useCallback(async () => {
    try {
      // skip_connect=true once QR is received: prevent each poll from
      // calling /instance/connect and resetting the QR session
      const result = await fetchInstanceStatus(instance.id, hasQrRef.current);
      setStatus(result);
      setError(null);

      if (result.qrcode) {
        hasQrRef.current = true;
      } else if (result.state !== "connecting") {
        // QR expired or connection reset — allow a fresh connect on next poll
        hasQrRef.current = false;
      }

      if (result.state === "open" && !wasConnected.current) {
        wasConnected.current = true;
        setMode("done");
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

  // Verificação inicial: apenas checa se já está conectado (skip_connect=true — não inicia QR)
  useEffect(() => {
    let cancelled = false;
    fetchInstanceStatus(instance.id, true)
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        if (result.state === "open") {
          wasConnected.current = true;
          setMode("done");
        }
      })
      .catch(() => {
        // ignora erro na verificação inicial — usuário pode tentar manualmente
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [instance.id]);

  // Inicia polling quando o usuário clica em "Conectar"
  const handleConnect = () => {
    setMode("connecting");
    setError(null);
    setLoading(true);
    wasConnected.current = false;
    hasQrRef.current = false; // fresh connect — allow /instance/connect on first poll
    stopPolling();
    poll();
    intervalRef.current = setInterval(poll, 3_000);
  };

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    poll();
    if (!intervalRef.current) {
      intervalRef.current = setInterval(poll, 3_000);
    }
  };

  // Limpa polling ao desmontar
  useEffect(() => () => stopPolling(), []);

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
      {loading && mode === "idle" && (
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
          <Button variant="outline" size="sm" onClick={handleRetry} className="text-xs gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
          </Button>
        </div>
      )}

      {/* Conectado */}
      {!error && mode === "done" && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm font-medium text-emerald-800">WhatsApp conectado com sucesso!</p>
          {status?.phone && (
            <p className="text-xs text-emerald-700 mt-1">
              Número: <span className="font-mono">{status.phone}</span>
            </p>
          )}
        </div>
      )}

      {/* Idle: desconectado, aguardando o usuário clicar */}
      {!error && mode === "idle" && !loading && status?.state !== "open" && (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5 flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 rounded-full bg-zinc-100 flex items-center justify-center">
            <Wifi className="h-5 w-5 text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700">WhatsApp desconectado</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em Conectar para gerar o QR code
            </p>
          </div>
          <Button onClick={handleConnect} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <Wifi className="h-4 w-4" />
            Conectar WhatsApp
          </Button>
        </div>
      )}

      {/* Buscando QR / polling ativo */}
      {!error && mode === "connecting" && (
        <>
          {loading && !status?.qrcode ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Gerando QR code...
            </div>
          ) : status?.qrcode ? (
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
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Aguardando QR code...
            </div>
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
