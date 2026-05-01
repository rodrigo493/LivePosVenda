import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Plug, Unplug, RefreshCw, ScrollText, Zap, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const RD_WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/rd-webhook`;

type RdConfig = {
  id: string;
  api_token: string;
  rd_pipeline_id: string | null;
  is_active: boolean;
  last_import_at: string | null;
  last_webhook_at: string | null;
  import_stats: {
    status?: string;
    total_deals?: number;
    total_contacts?: number;
    total_tasks?: number;
    total_activities?: number;
    imported_at?: string;
    started_at?: string;
    error?: string;
    stage_mismatches?: string[];
  } | null;
  webhook_secret: string | null;
};

type SyncLog = {
  id: string;
  operation: string;
  event_type: string | null;
  rd_id: string | null;
  status: string;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

function useRdConfig() {
  return useQuery<RdConfig | null>({
    queryKey: ["rd_integration_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rd_integration_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default function RdStationPage() {
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const { data: config, isLoading } = useRdConfig();
  const [tokenInput, setTokenInput] = useState("");
  const [editingToken, setEditingToken] = useState(false);
  const [logStatus, setLogStatus] = useState<string>("all");
  const [logsOpen, setLogsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [testing, setTesting] = useState(false);

  const isRunning = config?.import_stats?.status === "running";

  // Polling automático enquanto o servidor está importando
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["rd_integration_config"] });
    }, 5000);
    return () => clearInterval(interval);
  }, [isRunning, qc]);

  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const { data: logs } = useQuery<SyncLog[]>({
    queryKey: ["rd_sync_log", logStatus],
    queryFn: async () => {
      let q = supabase
        .from("rd_sync_log")
        .select("id, operation, event_type, rd_id, status, error_message, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (logStatus !== "all") q = q.eq("status", logStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SyncLog[];
    },
    enabled: logsOpen,
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      token,
      rdPipelineId,
      isActive,
    }: {
      token?: string;
      rdPipelineId?: string;
      isActive?: boolean;
    }) => {
      if (config) {
        const patch: Record<string, unknown> = {};
        if (token !== undefined) patch.api_token = token;
        if (rdPipelineId !== undefined) patch.rd_pipeline_id = rdPipelineId;
        if (isActive !== undefined) patch.is_active = isActive;
        const { error } = await supabase
          .from("rd_integration_config")
          .update(patch)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rd_integration_config").insert({
          api_token: token!,
          rd_pipeline_id: rdPipelineId || null,
          is_active: isActive ?? false,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rd_integration_config"] });
      toast.success("Configuração salva.");
      setEditingToken(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleTestConnection() {
    const token = config?.api_token;
    if (!token) {
      toast.error("Configure o token primeiro.");
      return;
    }
    setTesting(true);
    try {
      const res = await supabase.functions.invoke("rd-test", {
        body: { token },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data as {
        ok: boolean;
        status?: number;
        pipeline?: { id: string; name: string } | null;
        pipelines?: { id: string; name: string }[];
        total_deals?: number | null;
      };
      if (data.ok) {
        const pipelineNames = (data.pipelines ?? (data.pipeline ? [data.pipeline] : []))
          .map((p) => p.name)
          .join(", ");
        const dealInfo = data.total_deals != null ? ` · ${data.total_deals} negociações no RD` : "";
        toast.success(
          `Conexão OK! ${pipelineNames ? `Pipelines: ${pipelineNames}` : "Sem pipelines detectados"}${dealInfo}`,
          { duration: 8000 },
        );
      } else {
        toast.error(`Falha na conexão: HTTP ${data.status ?? "?"} — verifique o token.`);
      }
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleImport() {
    if (!config?.is_active) {
      toast.error("Ative a integração antes de importar.");
      return;
    }
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("rd-import", {
        body: { skip_contacts: true },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message);
      const data = res.data as { ok: boolean; started?: boolean; already_running?: boolean; error?: string; message?: string };
      if (!data?.ok) throw new Error(data?.error || "Erro desconhecido");
      if (data.already_running) {
        toast.info("Importação já está em andamento no servidor.");
      } else {
        toast.success(data.message ?? "Importação iniciada!", { duration: 8000 });
      }
      qc.invalidateQueries({ queryKey: ["rd_integration_config"] });
    } catch (e) {
      toast.error(`Erro: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a administradores.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Integração RD Station CRM</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sincronização unidirecional RD Station → LivePosVenda
          </p>
        </div>
        <Badge
          variant={config?.is_active ? "default" : "secondary"}
          className={config?.is_active ? "bg-green-600 text-white" : ""}
        >
          {config?.is_active ? (
            <>
              <Plug className="h-3 w-3 mr-1" />
              CONECTADO
            </>
          ) : (
            <>
              <Unplug className="h-3 w-3 mr-1" />
              DESCONECTADO
            </>
          )}
        </Badge>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-sm">Token de API</h2>
        {editingToken ? (
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Cole o token da API CRM v1"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="flex-1 h-8 text-sm"
            />
            <Button
              size="sm"
              className="h-8"
              disabled={!tokenInput || saveMutation.isPending}
              onClick={() => saveMutation.mutate({ token: tokenInput })}
            >
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setEditingToken(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground flex-1 font-mono">
              {config?.api_token ? "••••••••••••••••" : "Não configurado"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setTokenInput("");
                setEditingToken(true);
              }}
            >
              {config?.api_token ? "Alterar" : "Configurar"}
            </Button>
          </div>
        )}
      </div>

      {config && (
        <div className="border rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Status da integração</p>
            <p className="text-xs text-muted-foreground">
              {config.is_active
                ? "Webhooks sendo recebidos."
                : "Webhooks serão ignorados até ativar."}
            </p>
          </div>
          <Button
            size="sm"
            variant={config.is_active ? "destructive" : "default"}
            className="h-8"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ isActive: !config.is_active })}
          >
            {config.is_active ? "Desativar" : "Ativar"}
          </Button>
        </div>
      )}

      {/* Diagnóstico de webhook */}
      {config && (
        <div className={`border rounded-lg p-4 space-y-2 ${
          !config.last_webhook_at
            ? "border-amber-500/50 bg-amber-50/5"
            : "border-green-500/30 bg-green-50/5"
        }`}>
          <div className="flex items-center gap-2">
            {config.last_webhook_at ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <h2 className="font-semibold text-sm">
              Status do Webhook em Tempo Real
            </h2>
          </div>
          {!config.last_webhook_at ? (
            <p className="text-xs text-amber-600 font-medium">
              ⚠ Nenhum webhook recebido ainda. Verifique se a URL está cadastrada no RD Station e se a integração está ativa.
            </p>
          ) : (
            <p className="text-xs text-green-600">
              Último evento recebido: {fmtDate(config.last_webhook_at)}
            </p>
          )}
        </div>
      )}

      <div className="border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-sm">Configurar Webhook no RD Station</h2>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Acesse <strong>RD Station CRM → Configurações → Integrações → Webhooks</strong></li>
          <li>Clique em <strong>Novo Webhook</strong></li>
          <li>Cole a URL abaixo no campo de URL</li>
          <li>Selecione os eventos: <code className="bg-muted px-1 rounded">Negociação Criada</code> e <code className="bg-muted px-1 rounded">Negociação Atualizada</code></li>
          <li>Salve e verifique se a integração está <strong>Ativa</strong> nesta página</li>
        </ol>
        <div className="flex items-center gap-2 bg-muted rounded px-3 py-2">
          <span className="text-xs font-mono flex-1 break-all">
            {RD_WEBHOOK_URL}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(RD_WEBHOOK_URL);
              toast.success("URL copiada!");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Eventos internos:{" "}
          <code className="bg-muted px-1 rounded">crm_deal_created</code>,{" "}
          <code className="bg-muted px-1 rounded">crm_deal_updated</code>,{" "}
          <code className="bg-muted px-1 rounded">crm_deal_deleted</code>
        </p>
      </div>

      {config && (
        <div className="border rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Último import</p>
            <p className="font-medium">{fmtDate(config.last_import_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Último webhook</p>
            <p className="font-medium">{fmtDate(config.last_webhook_at)}</p>
          </div>
          {config.import_stats && (
            <div className="col-span-2 bg-muted/50 rounded p-2 text-xs space-y-0.5">
              {config.import_stats.status === "running" ? (
                <p className="text-yellow-400 font-medium">⏳ Importação em andamento…</p>
              ) : config.import_stats.status === "error" ? (
                <p className="text-red-400 font-medium">❌ Erro: {config.import_stats.error}</p>
              ) : (
                <>
                  <p>Negociações importadas: <strong>{config.import_stats.total_deals ?? 0}</strong></p>
                  <p>Contatos: {config.import_stats.total_contacts ?? 0}</p>
                  <p>Tarefas: {config.import_stats.total_tasks ?? 0}</p>
                  <p>Anotações: {config.import_stats.total_activities ?? 0}</p>
                  {(config.import_stats.stage_mismatches?.length ?? 0) > 0 && (
                    <p className="text-amber-500 mt-1">
                      ⚠ Etapas sem correspondência ({config.import_stats.stage_mismatches!.length}): {config.import_stats.stage_mismatches!.join(", ")}
                    </p>
                  )}
                  {config.import_stats.imported_at && (
                    <p className="text-muted-foreground">
                      em {fmtDate(config.import_stats.imported_at)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={testing || !config?.api_token}
          onClick={handleTestConnection}
        >
          <Zap className="h-3.5 w-3.5" />
          {testing ? "Testando..." : "Testar conexão"}
        </Button>

        <div className="flex flex-col gap-1">
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={importing || !config?.is_active || isRunning}
            onClick={handleImport}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${(importing || isRunning) ? "animate-spin" : ""}`} />
            {importing ? "Iniciando..." : isRunning ? "Importando no servidor..." : "Importar Histórico Completo"}
          </Button>
          {isRunning && config?.import_stats && (
            <p className="text-xs text-yellow-500 animate-pulse">
              ⏳ Processando página {(config.import_stats as Record<string,unknown>).current_page as number ?? "?"}
              {" · "}
              {(config.import_stats as Record<string,unknown>).total_deals as number ?? 0} deals importados
              {" · "}Pode navegar para outras páginas
            </p>
          )}
        </div>

        <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-1.5">
              <ScrollText className="h-3.5 w-3.5" />
              Ver Logs
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-6">
                <DialogTitle>Logs de Sincronização RD Station</DialogTitle>
                <Select value={logStatus} onValueChange={setLogStatus}>
                  <SelectTrigger className="w-32 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="error">Erro</SelectItem>
                    <SelectItem value="skipped">Ignorado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-4"></TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Operação</TableHead>
                  <TableHead className="text-xs">Evento</TableHead>
                  <TableHead className="text-xs">ID RD</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(logs ?? []).map((log) => (
                  <>
                    <TableRow
                      key={log.id}
                      className={log.payload ? "cursor-pointer hover:bg-muted/40" : ""}
                      onClick={() => log.payload && setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <TableCell className="text-xs px-1">
                        {log.payload && (
                          expandedLog === log.id
                            ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {fmtDate(log.created_at)}
                      </TableCell>
                      <TableCell className="text-xs">{log.operation}</TableCell>
                      <TableCell className="text-xs">
                        {log.event_type ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {log.rd_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge
                          variant={
                            log.status === "success"
                              ? "default"
                              : log.status === "error"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.error_message ?? "—"}
                      </TableCell>
                    </TableRow>
                    {expandedLog === log.id && log.payload && (
                      <TableRow key={`${log.id}-payload`}>
                        <TableCell colSpan={7} className="bg-muted/30 px-4 py-2">
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">Payload recebido:</p>
                          <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
                {(logs ?? []).length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-xs text-muted-foreground py-4"
                    >
                      Nenhum log encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
