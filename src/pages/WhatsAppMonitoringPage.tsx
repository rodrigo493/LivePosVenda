import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, WifiOff, Loader2, RefreshCw, Radio,
  MessageSquare, User, Phone, Activity, Clock,
  CheckCircle2, AlertCircle, XCircle, Signal,
  ChevronDown, ChevronRight, Zap, BarChart3,
  ShieldCheck, GitBranch, Smartphone, Timer,
  Circle, QrCode, LogOut,
} from "lucide-react";
import { formatDate } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Instance {
  id: string;
  pipeline_id: string;
  instance_name: string;
  phone_number: string | null;
  uazapi_instance_name: string;
  instance_token: string;
  base_url: string;
  distribution_pct: number;
  active: boolean;
  created_at: string;
  user_id: string | null;
  pipelines: { id: string; name: string; slug: string } | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  email: string;
}

interface InstanceStatus {
  state: "open" | "close" | "connecting" | "error";
  phone: string | null;
  checkedAt: Date;
  error?: string;
}

interface MsgStats {
  total24h: number;
  total7d: number;
  lastMsgAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | Date | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  return phone;
}

function normalizeQr(raw: string): string {
  if (raw.startsWith("data:")) return raw;
  return `data:image/png;base64,${raw}`;
}

// ─── Status indicator ─────────────────────────────────────────────────────────

function StatusDot({ state }: { state: InstanceStatus["state"] | null }) {
  if (!state) return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <Circle className="h-2.5 w-2.5 fill-muted-foreground/30 text-muted-foreground/30" />
      Não verificado
    </span>
  );
  if (state === "open") return (
    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      Conectado
    </span>
  );
  if (state === "connecting") return (
    <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-medium">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>
      Conectando…
    </span>
  );
  if (state === "error") return (
    <span className="flex items-center gap-1.5 text-rose-500 text-xs font-medium">
      <AlertCircle className="h-3 w-3" />
      Erro
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/40" />
      Desconectado
    </span>
  );
}

// ─── Instance row ─────────────────────────────────────────────────────────────

function InstanceRow({
  instance,
  profile,
  stats,
  status,
  checking,
  qrCode,
  connecting,
  disconnecting,
  onCheck,
  onConnect,
  onDisconnect,
}: {
  instance: Instance;
  profile: Profile | null;
  stats: MsgStats | null;
  status: InstanceStatus | null;
  checking: boolean;
  qrCode: string | null;
  connecting: boolean;
  disconnecting: boolean;
  onCheck: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isConnected = status?.state === "open";
  const isDisconnected = !status || status.state === "close" || status.state === "error";
  const isConnecting = status?.state === "connecting";

  const stateColor =
    isConnected ? "border-l-emerald-500" :
    isConnecting ? "border-l-amber-400" :
    status?.state === "close" ? "border-l-rose-400" :
    status?.state === "error" ? "border-l-rose-500" :
    "border-l-border";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl bg-card overflow-hidden border-l-4 ${stateColor} transition-colors`}
    >
      {/* ── Main row ── */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">
        <div className="grid grid-cols-[180px_1fr_1fr_1fr_1fr_100px] items-center gap-4 min-w-0">
          {/* Instância */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold truncate">{instance.instance_name}</span>
              {!instance.active && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground shrink-0">
                  inativo
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 pl-5 truncate">
              {instance.uazapi_instance_name}
            </p>
          </div>

          {/* Status */}
          <div>
            <StatusDot state={status?.state ?? null} />
            {status && (
              <p className="text-[9px] text-muted-foreground mt-1 pl-0.5">
                {timeAgo(status.checkedAt)}
              </p>
            )}
          </div>

          {/* Funil */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs truncate">{instance.pipelines?.name || "—"}</span>
            </div>
            <div className="flex items-center gap-1 mt-1 pl-0.5">
              <BarChart3 className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{instance.distribution_pct}% distrib.</span>
            </div>
          </div>

          {/* Número */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono">
                {formatPhone(status?.phone ?? instance.phone_number)}
              </span>
            </div>
            {status?.phone && status.phone !== instance.phone_number && (
              <p className="text-[9px] text-amber-500 mt-0.5 pl-4.5">
                Diferente do cadastro
              </p>
            )}
          </div>

          {/* Usuário */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs truncate">
                {profile?.full_name || profile?.email || "Sem vínculo"}
              </span>
            </div>
            {profile && (
              <p className="text-[9px] text-muted-foreground mt-0.5 pl-4.5 truncate">{profile.email}</p>
            )}
          </div>

          {/* Msgs */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-1">
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold tabular-nums">
                {stats?.total24h ?? "—"}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground">últ. 24h</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">
              {stats ? `${stats.total7d} em 7d` : ""}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Conectar — visível quando desconectado */}
          {isDisconnected && (
            <button
              onClick={onConnect}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
            >
              {connecting
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <QrCode className="h-3 w-3" />
              }
              {connecting ? "Gerando QR…" : "Conectar"}
            </button>
          )}

          {/* Desconectar — visível quando conectado */}
          {isConnected && (
            <button
              onClick={onDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50"
            >
              {disconnecting
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <LogOut className="h-3 w-3" />
              }
              {disconnecting ? "Desconectando…" : "Desconectar"}
            </button>
          )}

          <button
            onClick={onCheck}
            disabled={checking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {checking
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Signal className="h-3 w-3" />
            }
            {checking ? "Verificando…" : "Verificar"}
          </button>

          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
        </div>
      </div>

      {/* ── QR Code panel ── */}
      <AnimatePresence>
        {qrCode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t bg-amber-50 dark:bg-amber-950/20 px-5 py-4 flex items-center gap-6">
              <img
                src={normalizeQr(qrCode)}
                alt="QR Code WhatsApp"
                className="w-36 h-36 rounded-lg border border-amber-200 dark:border-amber-800 bg-white p-1 shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                  Escaneie o QR Code no WhatsApp
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
                </p>
                <p className="text-[10px] text-amber-600/70 dark:text-amber-500/60 mt-2">
                  Verificando conexão a cada 5 segundos…
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Expanded details ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t bg-muted/30 px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <DetailField icon={<Radio className="h-3 w-3" />} label="URL Uazapi" value={instance.base_url} mono />
              <DetailField icon={<ShieldCheck className="h-3 w-3" />} label="Token" value={`${instance.instance_token.slice(0, 8)}…${instance.instance_token.slice(-4)}`} mono />
              <DetailField icon={<Clock className="h-3 w-3" />} label="Criado em" value={formatDate(instance.created_at)} />
              <DetailField icon={<Activity className="h-3 w-3" />} label="Última mensagem" value={stats?.lastMsgAt ? timeAgo(stats.lastMsgAt) : "—"} />
              {status && (
                <>
                  <DetailField icon={<Timer className="h-3 w-3" />} label="Última verificação" value={status.checkedAt.toLocaleTimeString("pt-BR")} />
                  <DetailField icon={<Phone className="h-3 w-3" />} label="Número Uazapi" value={formatPhone(status.phone)} mono />
                  <DetailField icon={<Phone className="h-3 w-3" />} label="Número cadastrado" value={formatPhone(instance.phone_number)} mono />
                </>
              )}
              {status?.error && (
                <div className="col-span-2 md:col-span-4 text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/30 rounded-lg px-3 py-2 border border-rose-200 dark:border-rose-800">
                  Erro: {status.error}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailField({
  icon, label, value, mono = false
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase tracking-wide mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-xs text-foreground truncate ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhatsAppMonitoringPage() {
  const { hasRole, rolesLoading } = useAuth();
  const isAdmin = hasRole("admin");

  const [statuses, setStatuses] = useState<Record<string, InstanceStatus>>({});
  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [qrCodes, setQrCodes] = useState<Record<string, string | null>>({});
  const [connecting, setConnecting] = useState<Record<string, boolean>>({});
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});
  const abortRef = useRef(false);
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Limpa timers de polling ao desmontar
  useEffect(() => {
    return () => { Object.values(pollTimers.current).forEach(clearInterval); };
  }, []);

  // ── Fetch instances + pipelines
  const { data: instances, isLoading: loadingInstances, refetch } = useQuery({
    queryKey: ["wa-monitoring-instances"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_whatsapp_instances")
        .select("*, pipelines(id, name, slug)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Instance[];
    },
  });

  // ── Fetch profiles (for user name resolution)
  const { data: profiles } = useQuery({
    queryKey: ["wa-monitoring-profiles"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name, email");
      if (error) throw error;
      return data as Profile[];
    },
  });

  // ── Fetch message stats (last 7 days)
  const { data: msgStats } = useQuery({
    queryKey: ["wa-monitoring-msg-stats"],
    queryFn: async () => {
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("whatsapp_messages")
        .select("instance_id, created_at")
        .gte("created_at", since7d)
        .not("instance_id", "is", null);
      if (error) throw error;

      const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
      const statsMap: Record<string, MsgStats> = {};
      for (const msg of data ?? []) {
        if (!msg.instance_id) continue;
        if (!statsMap[msg.instance_id]) {
          statsMap[msg.instance_id] = { total24h: 0, total7d: 0, lastMsgAt: null };
        }
        statsMap[msg.instance_id].total7d++;
        if (new Date(msg.created_at).getTime() > cutoff24h) {
          statsMap[msg.instance_id].total24h++;
        }
        if (!statsMap[msg.instance_id].lastMsgAt || msg.created_at > statsMap[msg.instance_id].lastMsgAt!) {
          statsMap[msg.instance_id].lastMsgAt = msg.created_at;
        }
      }
      return statsMap;
    },
    staleTime: 60_000,
  });

  // ── Profile lookup
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]));

  // ── Helper: chama whatsapp-instance-status
  const callStatusFn = useCallback(async (body: Record<string, unknown>) => {
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
        body: JSON.stringify(body),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }, []);

  // ── Polling: verifica status a cada 5s até conectar
  const startPolling = useCallback((instanceId: string) => {
    if (pollTimers.current[instanceId]) clearInterval(pollTimers.current[instanceId]);

    pollTimers.current[instanceId] = setInterval(async () => {
      try {
        const data = await callStatusFn({ instance_id: instanceId, skip_connect: true });
        setStatuses(prev => ({
          ...prev,
          [instanceId]: { state: data.state ?? "close", phone: data.phone ?? null, checkedAt: new Date() },
        }));
        if (data.state === "open") {
          clearInterval(pollTimers.current[instanceId]);
          delete pollTimers.current[instanceId];
          setQrCodes(prev => ({ ...prev, [instanceId]: null }));
          toast.success("WhatsApp conectado com sucesso!");
        }
      } catch { /* silencioso em polling */ }
    }, 5000);
  }, [callStatusFn]);

  // ── Check single instance status
  const checkInstance = useCallback(async (instanceId: string) => {
    setChecking(prev => ({ ...prev, [instanceId]: true }));
    try {
      const data = await callStatusFn({ instance_id: instanceId, skip_connect: true });
      setStatuses(prev => ({
        ...prev,
        [instanceId]: { state: data.state ?? "close", phone: data.phone ?? null, checkedAt: new Date() },
      }));
    } catch (err: any) {
      setStatuses(prev => ({
        ...prev,
        [instanceId]: { state: "error", phone: null, checkedAt: new Date(), error: err.message },
      }));
      toast.error(`Erro ao verificar instância: ${err.message}`);
    } finally {
      setChecking(prev => ({ ...prev, [instanceId]: false }));
    }
  }, [callStatusFn]);

  // ── Connect: gera QR code e inicia polling
  const connectInstance = useCallback(async (instanceId: string) => {
    setConnecting(prev => ({ ...prev, [instanceId]: true }));
    try {
      const data = await callStatusFn({ instance_id: instanceId });
      setStatuses(prev => ({
        ...prev,
        [instanceId]: { state: data.state ?? "connecting", phone: data.phone ?? null, checkedAt: new Date() },
      }));
      if (data.qrcode) {
        setQrCodes(prev => ({ ...prev, [instanceId]: data.qrcode }));
      }
      if (data.state !== "open") {
        startPolling(instanceId);
      } else {
        toast.success("Já conectado!");
      }
    } catch (err: any) {
      toast.error(`Erro ao conectar: ${err.message}`);
    } finally {
      setConnecting(prev => ({ ...prev, [instanceId]: false }));
    }
  }, [callStatusFn, startPolling]);

  // ── Disconnect: logout da instância
  const disconnectInstance = useCallback(async (instanceId: string, instanceName: string) => {
    if (!window.confirm(`Desconectar a instância "${instanceName}"?\nO QR code precisará ser escaneado novamente.`)) return;
    setDisconnecting(prev => ({ ...prev, [instanceId]: true }));
    try {
      await callStatusFn({ instance_id: instanceId, action: "logout" });
      setStatuses(prev => ({
        ...prev,
        [instanceId]: { state: "close", phone: null, checkedAt: new Date() },
      }));
      toast.success(`"${instanceName}" desconectada.`);
    } catch (err: any) {
      toast.error(`Erro ao desconectar: ${err.message}`);
    } finally {
      setDisconnecting(prev => ({ ...prev, [instanceId]: false }));
    }
  }, [callStatusFn]);

  // ── Check all instances sequentially
  const checkAll = useCallback(async () => {
    if (!instances?.length) return;
    setCheckingAll(true);
    abortRef.current = false;
    let success = 0;
    for (const inst of instances) {
      if (abortRef.current) break;
      await checkInstance(inst.id);
      success++;
    }
    setCheckingAll(false);
    toast.success(`${success} instância${success !== 1 ? "s" : ""} verificada${success !== 1 ? "s" : ""}`);
  }, [instances, checkInstance]);

  // ── Summary counts
  const totalInstances = instances?.length ?? 0;
  const connectedCount = Object.values(statuses).filter(s => s.state === "open").length;
  const connectingCount = Object.values(statuses).filter(s => s.state === "connecting").length;
  const disconnectedCount = Object.values(statuses).filter(s => s.state === "close").length;
  const errorCount = Object.values(statuses).filter(s => s.state === "error").length;
  const checkedCount = Object.keys(statuses).length;

  // ── Admin guard
  if (!rolesLoading && !isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Monitor WhatsApp"
        description="Status em tempo real de todas as instâncias WhatsApp"
        icon={Radio}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted text-muted-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Recarregar lista
            </button>
            <button
              onClick={checkAll}
              disabled={checkingAll || loadingInstances}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {checkingAll
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Zap className="h-3 w-3" />
              }
              {checkingAll ? "Verificando…" : "Verificar Todas"}
            </button>
          </div>
        }
      />

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <SummaryCard
          label="Total"
          value={totalInstances}
          icon={<Smartphone className="h-4 w-4" />}
          color="text-foreground"
          bg="bg-card"
        />
        <SummaryCard
          label="Conectados"
          value={connectedCount}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-emerald-600 dark:text-emerald-400"
          bg="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <SummaryCard
          label="Conectando"
          value={connectingCount}
          icon={<Loader2 className="h-4 w-4" />}
          color="text-amber-600 dark:text-amber-400"
          bg="bg-amber-50 dark:bg-amber-950/30"
        />
        <SummaryCard
          label="Desconectados"
          value={disconnectedCount}
          icon={<XCircle className="h-4 w-4" />}
          color="text-rose-600 dark:text-rose-400"
          bg="bg-rose-50 dark:bg-rose-950/30"
        />
        <SummaryCard
          label="Verificados"
          value={`${checkedCount}/${totalInstances}`}
          icon={<Activity className="h-4 w-4" />}
          color="text-blue-600 dark:text-blue-400"
          bg="bg-blue-50 dark:bg-blue-950/30"
        />
      </div>

      {/* ── Column headers ── */}
      {!loadingInstances && (instances?.length ?? 0) > 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2 mb-1">
          <div className="grid grid-cols-[180px_1fr_1fr_1fr_1fr_100px] gap-4 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            <span>Instância</span>
            <span>Status</span>
            <span>Funil</span>
            <span>Número</span>
            <span>Usuário</span>
            <span className="text-right">Msgs</span>
          </div>
          <div className="w-[106px]" />
        </div>
      )}

      {/* ── Instance list ── */}
      {loadingInstances ? (
        <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando instâncias…</span>
        </div>
      ) : !instances?.length ? (
        <div className="py-20 text-center text-sm text-muted-foreground bg-card rounded-xl border">
          Nenhuma instância WhatsApp cadastrada.
        </div>
      ) : (
        <div className="space-y-2">
          {instances.map(inst => (
            <InstanceRow
              key={inst.id}
              instance={inst}
              profile={inst.user_id ? profileMap[inst.user_id] ?? null : null}
              stats={msgStats?.[inst.id] ?? null}
              status={statuses[inst.id] ?? null}
              checking={checking[inst.id] ?? false}
              qrCode={qrCodes[inst.id] ?? null}
              connecting={connecting[inst.id] ?? false}
              disconnecting={disconnecting[inst.id] ?? false}
              onCheck={() => checkInstance(inst.id)}
              onConnect={() => connectInstance(inst.id)}
              onDisconnect={() => disconnectInstance(inst.id, inst.instance_name)}
            />
          ))}
        </div>
      )}

      {/* ── Error count notice ── */}
      {errorCount > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg px-4 py-2.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {errorCount} instância{errorCount !== 1 ? "s" : ""} retornou erro na verificação. Expanda o card para ver o detalhe.
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label, value, icon, color, bg,
}: { label: string; value: string | number; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className={`${bg} border rounded-xl px-4 py-3 flex items-center gap-3`}>
      <span className={color}>{icon}</span>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-bold tabular-nums leading-tight ${color}`}>{value}</p>
      </div>
    </div>
  );
}
