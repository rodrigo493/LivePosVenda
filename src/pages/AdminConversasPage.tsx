import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { WaFeedbackPanel } from "@/components/wa/WaFeedbackPanel";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Search, ArrowUpRight, ArrowDownLeft,
  Loader2, RefreshCw, ExternalLink, Inbox, User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaMessage {
  id: string;
  client_id: string;
  ticket_id: string | null;
  direction: "inbound" | "outbound";
  message_text: string;
  created_at: string;
  instance_id: string | null;
  clients: { id: string; name: string | null; phone: string | null; whatsapp: string | null } | null;
  pipeline_whatsapp_instances: { id: string; user_id: string | null; instance_name: string } | null;
}

interface Conversation {
  client_id: string;
  client_name: string;
  client_phone: string;
  last_message: string;
  last_direction: "inbound" | "outbound";
  last_at: string;
  ticket_id: string | null;
  instance_user_id: string | null;
  instance_name: string | null;
}

interface Profile {
  user_id: string;
  full_name: string;
  email: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminConversasPage() {
  const { hasRole, rolesLoading } = useAuth();
  const isAdmin = hasRole("admin");
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState<string>("todos");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // ── Redirect se não admin ──────────────────────────────────────────────────
  if (!rolesLoading && !isAdmin) return <Navigate to="/" replace />;

  // ── Perfis dos usuários ────────────────────────────────────────────────────
  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ["profiles-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      return (data || []) as Profile[];
    },
    staleTime: 300_000,
  });

  const profileName = (uid: string | null) => {
    if (!uid) return "—";
    const p = profiles.find((x) => x.user_id === uid);
    return p?.full_name || p?.email || uid.slice(0, 8);
  };

  // ── Lista de conversas (última mensagem por cliente) ───────────────────────
  const {
    data: rawMessages = [],
    isLoading: loadingList,
    refetch: refetchList,
    dataUpdatedAt,
  } = useQuery<WaMessage[]>({
    queryKey: ["admin-conversas-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(`
          id, client_id, ticket_id, direction, message_text, created_at, instance_id,
          clients!inner( id, name, phone, whatsapp ),
          pipeline_whatsapp_instances( id, user_id, instance_name )
        `)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as WaMessage[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Dedup: mantém apenas a mensagem mais recente por cliente
  const conversations = useMemo<Conversation[]>(() => {
    const seen = new Set<string>();
    const result: Conversation[] = [];
    for (const m of rawMessages) {
      if (!m.client_id || seen.has(m.client_id)) continue;
      seen.add(m.client_id);
      const c = m.clients;
      result.push({
        client_id: m.client_id,
        client_name: c?.name || c?.phone || c?.whatsapp || "Desconhecido",
        client_phone: c?.whatsapp || c?.phone || "",
        last_message: m.message_text,
        last_direction: m.direction,
        last_at: m.created_at,
        ticket_id: m.ticket_id,
        instance_user_id: m.pipeline_whatsapp_instances?.user_id ?? null,
        instance_name: m.pipeline_whatsapp_instances?.instance_name ?? null,
      });
    }
    return result;
  }, [rawMessages]);

  // Todos os usuários (do profiles, não só os que têm mensagens)
  const uniqueUsers = useMemo(() => {
    return profiles.map((p) => ({
      id: p.user_id,
      name: p.full_name || p.email || p.user_id.slice(0, 8),
    }));
  }, [profiles]);

  // Filtro por busca + usuário
  const filtered = useMemo(() => {
    return conversations.filter((c) => {
      const matchSearch =
        !search ||
        c.client_name.toLowerCase().includes(search.toLowerCase()) ||
        c.client_phone.includes(search);
      const matchUser =
        filterUser === "todos" ||
        c.instance_user_id === filterUser ||
        (filterUser === "sem_usuario" && !c.instance_user_id);
      return matchSearch && matchUser;
    });
  }, [conversations, search, filterUser]);

  // ── Thread da conversa selecionada ─────────────────────────────────────────
  const { data: thread = [], isLoading: loadingThread } = useQuery<WaMessage[]>({
    queryKey: ["admin-thread", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(`
          id, client_id, ticket_id, direction, message_text, created_at, instance_id,
          clients( id, name, phone, whatsapp ),
          pipeline_whatsapp_instances( id, user_id, instance_name )
        `)
        .eq("client_id", selectedClientId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WaMessage[];
    },
    refetchInterval: 15_000,
  });

  // Scroll para o fim do thread quando carrega
  useEffect(() => {
    if (thread.length > 0 && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [thread]);

  const selectedConv = filtered.find((c) => c.client_id === selectedClientId);
  const ticketId = selectedConv?.ticket_id || thread[0]?.ticket_id || null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader
        title="Conversas WhatsApp"
        description="Visão admin de todas as conversas por usuário"
        icon={MessageSquare}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchList()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        }
      />

      {/* Layout dois painéis */}
      <div className="flex flex-1 overflow-hidden border-t">
        {/* ── Painel esquerdo: lista ─────────────────────────────────────── */}
        <div className="w-[360px] flex-shrink-0 flex flex-col border-r bg-white">
          {/* Filtros */}
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar contato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Todos os usuários" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os usuários</SelectItem>
                <SelectItem value="sem_usuario">Sem usuário</SelectItem>
                {uniqueUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground text-right">
              {filtered.length} conversa{filtered.length !== 1 ? "s" : ""}
              {dataUpdatedAt
                ? ` · atualizado ${format(new Date(dataUpdatedAt), "HH:mm")}`
                : ""}
            </p>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Inbox className="h-8 w-8 opacity-30" />
                <p className="text-sm">Nenhuma conversa encontrada</p>
              </div>
            ) : (
              filtered.map((conv) => (
                <ConversaItem
                  key={conv.client_id}
                  conv={conv}
                  isSelected={conv.client_id === selectedClientId}
                  userName={profileName(conv.instance_user_id)}
                  onClick={() => setSelectedClientId(conv.client_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Painel direito: thread ─────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
          {!selectedClientId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecione uma conversa para ver as mensagens</p>
            </div>
          ) : (
            <>
              {/* Header do thread */}
              <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-semibold">
                    {initials(selectedConv?.client_name || "?")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-none mb-0.5">
                      {selectedConv?.client_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedConv?.client_phone}
                      {selectedConv?.instance_user_id && (
                        <span className="ml-2 text-emerald-600">
                          · {profileName(selectedConv.instance_user_id)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {ticketId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => navigate(`/crm?open_ticket=${ticketId}`)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver no CRM
                  </Button>
                )}
              </div>

              {/* Mensagens */}
              <div
                ref={threadRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
              >
                {loadingThread ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Carregando mensagens...
                  </div>
                ) : thread.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-8">
                    Nenhuma mensagem encontrada
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {thread.map((msg, i) => {
                      const isOut = msg.direction === "outbound";
                      const prevMsg = thread[i - 1];
                      const showDate =
                        !prevMsg ||
                        format(new Date(msg.created_at), "yyyy-MM-dd") !==
                          format(new Date(prevMsg.created_at), "yyyy-MM-dd");

                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="flex justify-center my-3">
                              <span className="bg-white/80 text-[10px] text-muted-foreground px-3 py-0.5 rounded-full shadow-sm">
                                {isToday(new Date(msg.created_at))
                                  ? "Hoje"
                                  : isYesterday(new Date(msg.created_at))
                                  ? "Ontem"
                                  : format(new Date(msg.created_at), "dd 'de' MMMM", { locale: ptBR })}
                              </span>
                            </div>
                          )}
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn(
                              "flex mb-0.5",
                              isOut ? "justify-end" : "justify-start"
                            )}
                          >
                            <div
                              className={cn(
                                "max-w-[72%] rounded-2xl px-3.5 py-2 shadow-sm",
                                isOut
                                  ? "bg-[#d9fdd3] rounded-tr-sm"
                                  : "bg-white rounded-tl-sm"
                              )}
                            >
                              <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                                {msg.message_text}
                              </p>
                              <p
                                className={cn(
                                  "text-[10px] mt-0.5 text-right",
                                  isOut ? "text-emerald-700/60" : "text-muted-foreground/70"
                                )}
                              >
                                {format(new Date(msg.created_at), "HH:mm")}
                                {isOut && (
                                  <ArrowUpRight className="inline ml-1 h-2.5 w-2.5" />
                                )}
                              </p>
                            </div>
                          </motion.div>
                        </div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

              {/* Painel de Feedback WhatsApp */}
              {selectedClientId && (
                <WaFeedbackPanel clientId={selectedClientId} canAnalyze={true} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ConversaItem ─────────────────────────────────────────────────────────────

function ConversaItem({
  conv,
  isSelected,
  userName,
  onClick,
}: {
  conv: Conversation;
  isSelected: boolean;
  userName: string;
  onClick: () => void;
}) {
  const isOut = conv.last_direction === "outbound";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 border-b border-gray-50 text-left transition-colors",
        isSelected
          ? "bg-emerald-50 border-l-2 border-l-emerald-500"
          : "hover:bg-gray-50 border-l-2 border-l-transparent"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold",
          isSelected
            ? "bg-emerald-500 text-white"
            : "bg-gray-200 text-gray-600"
        )}
      >
        {initials(conv.client_name)}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1 mb-0.5">
          <span className="text-sm font-medium truncate">{conv.client_name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {formatMsgTime(conv.last_at)}
          </span>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          {isOut ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-500 flex-shrink-0" />
          ) : (
            <ArrowDownLeft className="h-3 w-3 text-blue-500 flex-shrink-0" />
          )}
          <span className="text-xs text-muted-foreground truncate">
            {conv.last_message}
          </span>
        </div>
        {userName && userName !== "—" && (
          <div className="flex items-center gap-1 mt-0.5">
            <User className="h-2.5 w-2.5 text-muted-foreground/50" />
            <span className="text-[10px] text-muted-foreground/60 truncate">
              {userName}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
