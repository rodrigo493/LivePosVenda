import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/layout/PageHeader";
import { WaFeedbackPanel } from "@/components/wa/WaFeedbackPanel";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Search, ArrowUpRight, ArrowDownLeft,
  Loader2, RefreshCw, ExternalLink, Inbox,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

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
}

function formatMsgTime(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  return format(d, "dd/MM", { locale: ptBR });
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function MinhasConversasWAPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  // Instâncias do usuário atual
  const { data: myInstances = [] } = useQuery<{ id: string }[]>({
    queryKey: ["my-wa-instances", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("pipeline_whatsapp_instances")
        .select("id")
        .eq("user_id", user!.id);
      return data || [];
    },
    staleTime: 60_000,
  });

  const instanceIds = myInstances.map((i) => i.id);

  // Mensagens das instâncias do usuário
  const {
    data: rawMessages = [],
    isLoading: loadingList,
    refetch: refetchList,
    dataUpdatedAt,
  } = useQuery<WaMessage[]>({
    queryKey: ["minhas-conversas-wa", instanceIds.join(",")],
    enabled: instanceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(`
          id, client_id, ticket_id, direction, message_text, created_at, instance_id,
          clients!inner( id, name, phone, whatsapp ),
          pipeline_whatsapp_instances( id, user_id, instance_name )
        `)
        .in("instance_id", instanceIds)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as unknown as WaMessage[];
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

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
      });
    }
    return result;
  }, [rawMessages]);

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        c.client_name.toLowerCase().includes(q) ||
        c.client_phone.includes(search)
    );
  }, [conversations, search]);

  const { data: thread = [], isLoading: loadingThread } = useQuery<WaMessage[]>({
    queryKey: ["minhas-conversas-thread", selectedClientId],
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
        .in("instance_id", instanceIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WaMessage[];
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (thread.length > 0 && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [thread]);

  const selectedConv = filtered.find((c) => c.client_id === selectedClientId);
  const ticketId = selectedConv?.ticket_id || thread[0]?.ticket_id || null;

  if (instanceIds.length === 0 && myInstances.length === 0 && !loadingList) {
    return (
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <PageHeader
          title="Minhas Conversas WhatsApp"
          description="Histórico das suas conversas"
          icon={MessageSquare}
        />
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-3">
          <MessageSquare className="h-12 w-12 opacity-20" />
          <p className="text-sm">Nenhuma instância WhatsApp vinculada ao seu usuário.</p>
          <p className="text-xs">Peça ao administrador para configurar uma instância.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader
        title="Minhas Conversas WhatsApp"
        description="Histórico das suas conversas com clientes"
        icon={MessageSquare}
        action={
          <Button variant="outline" size="sm" onClick={() => refetchList()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        }
      />

      <div className="flex flex-1 overflow-hidden border-t">
        {/* Painel esquerdo */}
        <div className="w-[360px] flex-shrink-0 flex flex-col border-r bg-white">
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
            <p className="text-[10px] text-muted-foreground text-right">
              {filtered.length} conversa{filtered.length !== 1 ? "s" : ""}
              {dataUpdatedAt
                ? ` · atualizado ${format(new Date(dataUpdatedAt), "HH:mm")}`
                : ""}
            </p>
          </div>

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
                  onClick={() => setSelectedClientId(conv.client_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Painel direito: thread */}
        <div className="flex-1 flex flex-col bg-[#f0f2f5] overflow-hidden">
          {!selectedClientId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecione uma conversa para ver as mensagens</p>
            </div>
          ) : (
            <>
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
                                {isOut && <ArrowUpRight className="inline ml-1 h-2.5 w-2.5" />}
                              </p>
                            </div>
                          </motion.div>
                        </div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>

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

function ConversaItem({
  conv,
  isSelected,
  onClick,
}: {
  conv: Conversation;
  isSelected: boolean;
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
      <div
        className={cn(
          "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold",
          isSelected ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"
        )}
      >
        {initials(conv.client_name)}
      </div>

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
      </div>
    </button>
  );
}
