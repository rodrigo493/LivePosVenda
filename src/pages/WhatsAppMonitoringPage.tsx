import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { motion } from "framer-motion";
import {
  Radio, MessageSquare, User, Phone, Activity,
  CheckCircle2, XCircle, Smartphone, BarChart3,
  GitBranch, Circle, Loader2, RefreshCw, Info,
  Puzzle, Chrome,
} from "lucide-react";
import { formatDate } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Instance {
  id: string;
  pipeline_id: string;
  instance_name: string;
  phone_number: string | null;
  distribution_pct: number;
  active: boolean;
  created_at: string;
  user_id: string | null;
  extension_last_ping: string | null;
  pipelines: { id: string; name: string } | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  email: string;
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

function isOnline(ping: string | null): boolean {
  if (!ping) return false;
  return Date.now() - new Date(ping).getTime() < 5 * 60 * 1000;
}

// ─── Extension status dot ─────────────────────────────────────────────────────

function ExtStatusDot({ ping }: { ping: string | null }) {
  const online = isOnline(ping);
  if (online) return (
    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      Extensão ativa
    </span>
  );
  if (ping) return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <span className="inline-flex rounded-full h-2.5 w-2.5 bg-muted-foreground/40" />
      Extensão offline
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <Circle className="h-2.5 w-2.5 fill-muted-foreground/20 text-muted-foreground/20" />
      Sem extensão
    </span>
  );
}

// ─── Instance row ─────────────────────────────────────────────────────────────

function InstanceRow({
  instance,
  profile,
  stats,
}: {
  instance: Instance;
  profile: Profile | null;
  stats: MsgStats | null;
}) {
  const online = isOnline(instance.extension_last_ping);

  const borderColor = online
    ? "border-l-emerald-500"
    : instance.extension_last_ping
      ? "border-l-muted-foreground/30"
      : "border-l-border";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl bg-card overflow-hidden border-l-4 ${borderColor} transition-colors`}
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4">
        <div className="grid grid-cols-[180px_1fr_1fr_1fr_1fr_100px] items-center gap-4 min-w-0">
          {/* Instância */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold truncate">{instance.instance_name}</span>
              {!instance.active && (
                <span className="text-[9px] px-1 py-0 text-muted-foreground border rounded shrink-0">inativo</span>
              )}
            </div>
          </div>

          {/* Status extensão */}
          <div>
            <ExtStatusDot ping={instance.extension_last_ping} />
            {instance.extension_last_ping && (
              <p className="text-[9px] text-muted-foreground mt-1">
                {timeAgo(instance.extension_last_ping)}
              </p>
            )}
          </div>

          {/* Funil */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs truncate">{instance.pipelines?.name || "—"}</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <BarChart3 className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{instance.distribution_pct}% distrib.</span>
            </div>
          </div>

          {/* Número */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs font-mono">{formatPhone(instance.phone_number)}</span>
            </div>
          </div>

          {/* Usuário */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs truncate">{profile?.full_name || profile?.email || "Sem vínculo"}</span>
            </div>
            {profile && (
              <p className="text-[9px] text-muted-foreground mt-0.5 pl-4.5 truncate">{profile.email}</p>
            )}
          </div>

          {/* Msgs */}
          <div className="text-right">
            <div className="flex items-center justify-end gap-1">
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold tabular-nums">{stats?.total24h ?? "—"}</span>
            </div>
            <p className="text-[9px] text-muted-foreground">últ. 24h</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 tabular-nums">
              {stats ? `${stats.total7d} em 7d` : ""}
            </p>
          </div>
        </div>

        {/* Última mensagem */}
        <div className="shrink-0 text-right min-w-[80px]">
          {stats?.lastMsgAt && (
            <div className="flex items-center gap-1 justify-end text-muted-foreground">
              <Activity className="h-3 w-3" />
              <span className="text-[10px]">{timeAgo(stats.lastMsgAt)}</span>
            </div>
          )}
          <p className="text-[9px] text-muted-foreground mt-0.5">{formatDate(instance.created_at)}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Instructions panel ───────────────────────────────────────────────────────

function InstallInstructions() {
  return (
    <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 rounded-xl px-5 py-4 flex gap-4">
      <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
      <div className="text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
        <p className="font-semibold">Como ativar a extensão WhatsApp</p>
        <ol className="list-decimal pl-4 space-y-1 text-blue-700 dark:text-blue-400">
          <li>Abra <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">chrome://extensions</code> no Chrome</li>
          <li>Ative <strong>Modo do desenvolvedor</strong> (toggle superior direito)</li>
          <li>Clique em <strong>Carregar sem compactação</strong> → selecione a pasta <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">livecrm-extension</code></li>
          <li>Clique no ícone <Puzzle className="h-3 w-3 inline" /> da extensão → <Chrome className="h-3 w-3 inline" /> <strong>LiveCRM WhatsApp</strong></li>
          <li>Faça login com suas credenciais do CRM</li>
          <li>Mantenha a aba do <strong>WhatsApp Web</strong> aberta durante o horário de trabalho</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhatsAppMonitoringPage() {
  const { hasRole, rolesLoading } = useAuth();
  const isAdmin = hasRole("admin");

  const { data: instances, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["wa-monitoring-instances"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pipeline_whatsapp_instances")
        .select("*, pipelines(id, name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Instance[];
    },
    refetchInterval: 30_000,
  });

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
        if (!statsMap[msg.instance_id])
          statsMap[msg.instance_id] = { total24h: 0, total7d: 0, lastMsgAt: null };
        statsMap[msg.instance_id].total7d++;
        if (new Date(msg.created_at).getTime() > cutoff24h)
          statsMap[msg.instance_id].total24h++;
        if (!statsMap[msg.instance_id].lastMsgAt || msg.created_at > statsMap[msg.instance_id].lastMsgAt!)
          statsMap[msg.instance_id].lastMsgAt = msg.created_at;
      }
      return statsMap;
    },
    staleTime: 60_000,
  });

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.user_id, p]));

  const totalInstances = instances?.length ?? 0;
  const onlineCount = (instances ?? []).filter(i => isOnline(i.extension_last_ping)).length;
  const offlineCount = totalInstances - onlineCount;

  if (!rolesLoading && !isAdmin) return <Navigate to="/" replace />;

  return (
    <div>
      <PageHeader
        title="Monitor WhatsApp"
        description="Status das extensões Chrome/Firefox em tempo real"
        icon={Radio}
        action={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-border bg-card hover:bg-muted text-muted-foreground transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        }
      />

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Total" value={totalInstances} icon={<Smartphone className="h-4 w-4" />} color="text-foreground" bg="bg-card" />
        <SummaryCard label="Extensão ativa" value={onlineCount} icon={<CheckCircle2 className="h-4 w-4" />} color="text-emerald-600 dark:text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/30" />
        <SummaryCard label="Offline" value={offlineCount} icon={<XCircle className="h-4 w-4" />} color="text-muted-foreground" bg="bg-card" />
      </div>

      {/* ── Column headers ── */}
      {!isLoading && (instances?.length ?? 0) > 0 && (
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2 mb-1">
          <div className="grid grid-cols-[180px_1fr_1fr_1fr_1fr_100px] gap-4 text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            <span>Instância</span>
            <span>Extensão</span>
            <span>Funil</span>
            <span>Número</span>
            <span>Usuário</span>
            <span className="text-right">Msgs</span>
          </div>
          <div className="w-[80px]" />
        </div>
      )}

      {/* ── Instance list ── */}
      {isLoading ? (
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
            />
          ))}
        </div>
      )}

      {/* ── Install instructions ── */}
      <div className="mt-6">
        <InstallInstructions />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color, bg }: {
  label: string; value: string | number; icon: React.ReactNode; color: string; bg: string;
}) {
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
