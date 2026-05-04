import { useState, useEffect, useMemo, useRef } from "react";
import { MessageSquare, Search, UserPlus, LayoutGrid, ArrowLeft } from "lucide-react";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { useWhatsAppConversations, useMarkConversationRead } from "@/hooks/useWhatsAppConversations";
import { useClients } from "@/hooks/useClients";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Client } from "@/types/database";

interface ChatUser {
  id: string;
  full_name: string | null;
}

function useChatUsers() {
  return useQuery<ChatUser[]>({
    queryKey: ["chat-users"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name");
      return ((data ?? []) as any[]).map((p) => ({ id: p.user_id, full_name: p.full_name })) as ChatUser[];
    },
  });
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

interface ActiveChat {
  client_id: string;
  client_name: string;
  client_phone: string;
}

export default function ChatPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  // Padrão: null = Todos. Muda para user.id quando detectamos que o usuário tem instância vinculada.
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const hasInitFilter = useRef(false);

  // Detecta se o usuário logado tem instância WhatsApp vinculada
  const { data: myInstance } = useQuery({
    queryKey: ["my-chat-instance", user?.id],
    enabled: !!user?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pipeline_whatsapp_instances")
        .select("id")
        .eq("user_id", user!.id)
        .eq("active", true)
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });

  // Inicializa o filtro com o próprio usuário se ele tem instância (apenas 1x)
  useEffect(() => {
    if (!hasInitFilter.current && myInstance && user?.id) {
      hasInitFilter.current = true;
      setUserFilter(user.id);
    }
  }, [myInstance, user?.id]);

  const { data: conversations, isLoading } = useWhatsAppConversations(isAdmin ? userFilter : undefined);

  const { data: diagCount } = useQuery({
    queryKey: ["diag-msg-count"],
    staleTime: 0,
    queryFn: async () => {
      const { count } = await supabase
        .from("whatsapp_messages")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: diagClientCount } = useQuery({
    queryKey: ["diag-client-count"],
    staleTime: 0,
    enabled: isAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: allClients } = useClients();
  const { data: chatUsers } = useChatUsers();
  const isMobile = useIsMobile();
  const [selectedChat, setSelectedChat] = useState<ActiveChat | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [search, setSearch] = useState("");
  const [creatingCard, setCreatingCard] = useState(false);
  const markRead = useMarkConversationRead();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientParam = searchParams.get("client");
  const navigate = useNavigate();

  const { data: clientCards } = useQuery({
    queryKey: ["client-cards", selectedChat?.client_id],
    enabled: !!selectedChat?.client_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tickets")
        .select("id, pipeline_id, service_requests(id), warranty_claims(id)")
        .eq("client_id", selectedChat!.client_id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!data) return { crmTicketId: null, paId: null, pgId: null };

      let crmTicketId: string | null = null;
      let paId: string | null = null;
      let pgId: string | null = null;

      for (const ticket of data) {
        if (!crmTicketId && ticket.pipeline_id) crmTicketId = ticket.id;
        if (!paId && (ticket.service_requests as any[])?.length > 0) paId = (ticket.service_requests as any[])[0].id;
        if (!pgId && (ticket.warranty_claims as any[])?.length > 0) pgId = (ticket.warranty_claims as any[])[0].id;
        if (crmTicketId && paId && pgId) break;
      }

      return { crmTicketId, paId, pgId };
    },
  });

  const handleCrmCard = async () => {
    if (!selectedChat) return;
    if (clientCards?.crmTicketId) {
      navigate(`/crm?open_ticket=${clientCards.crmTicketId}`);
      return;
    }
    setCreatingCard(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-crm-card`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            client_id: selectedChat.client_id,
            client_name: selectedChat.client_name,
            client_phone: selectedChat.client_phone,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao criar card");
      navigate("/crm", { state: { openTicket: result.ticket } });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar card no CRM");
    } finally {
      setCreatingCard(false);
    }
  };

  useEffect(() => {
    if (!selectedChat?.client_id) return;
    markRead.mutate(selectedChat.client_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.client_id]);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return conversations || [];
    const term = search.toLowerCase();
    return (conversations || []).filter((c) =>
      c.client_name.toLowerCase().includes(term) ||
      (c.client_phone || "").includes(term)
    );
  }, [conversations, search]);

  const conversationClientIds = useMemo(() =>
    new Set((conversations || []).map((c) => c.client_id)),
    [conversations]
  );

  const filteredSystemClients = useMemo(() => {
    if (!search.trim()) return [];
    const term = search.toLowerCase();
    return (allClients || []).filter((c) => {
      if (conversationClientIds.has(c.id)) return false;
      const phone = (c as any).whatsapp || c.phone || "";
      return (
        c.name.toLowerCase().includes(term) ||
        phone.includes(term)
      );
    }).slice(0, 5);
  }, [allClients, search, conversationClientIds]);

  useEffect(() => {
    if (filteredConversations.length === 0) return;
    if (clientParam) {
      const target = filteredConversations.find((c) => c.client_id === clientParam);
      if (target) {
        setSelectedChat({ client_id: target.client_id, client_name: target.client_name, client_phone: target.client_phone || "" });
        setMobileView("chat");
        setSearchParams({}, { replace: true });
        return;
      }
    }
    // No desktop, seleciona automaticamente a primeira conversa
    if (!selectedChat && !isMobile) {
      const first = filteredConversations[0];
      setSelectedChat({ client_id: first.client_id, client_name: first.client_name, client_phone: first.client_phone || "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredConversations, clientParam, isMobile]);

  const selectConversation = (conv: typeof filteredConversations[0]) => {
    setSelectedChat({ client_id: conv.client_id, client_name: conv.client_name, client_phone: conv.client_phone || "" });
    if (isMobile) setMobileView("chat");
  };

  const selectClient = (client: Client) => {
    const phone = (client as any).whatsapp || client.phone || "";
    setSelectedChat({ client_id: client.id, client_name: client.name, client_phone: phone });
    setSearch("");
    if (isMobile) setMobileView("chat");
  };

  const handleBackToList = () => {
    setMobileView("list");
  };

  // No mobile: altura sem o padding menor do main (p-4 = 1rem*2 + header 3.5rem = 5.5rem)
  // No desktop: altura com p-6 (1.5rem*2 + header 3.5rem = 6.5rem)
  const containerHeight = "h-[calc(100vh-5.5rem)] md:h-[calc(100vh-6.5rem)]";

  const showList = !isMobile || mobileView === "list";
  const showChat = !isMobile || mobileView === "chat";

  return (
    <div className={`flex ${containerHeight} overflow-hidden rounded-xl border bg-card`}>
      {/* Lista de conversas */}
      {showList && (
        <div className={`${isMobile ? "w-full" : "w-80 shrink-0"} flex flex-col border-r`}>
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conversa ou cliente..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            {/* Filtro por usuário — visível apenas para admin */}
            {isAdmin && chatUsers && chatUsers.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                <button
                  onClick={() => setUserFilter(null)}
                  className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    userFilter === null
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-transparent text-muted-foreground border-border hover:border-zinc-400"
                  }`}
                >
                  Todos
                </button>
                {chatUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setUserFilter(u.id === userFilter ? null : u.id)}
                    className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      userFilter === u.id
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-transparent text-muted-foreground border-border hover:border-zinc-400"
                    }`}
                  >
                    {u.full_name?.split(" ")[0] || "Usuário"}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* System clients search results */}
            {filteredSystemClients.length > 0 && (
              <div>
                <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/30">
                  Clientes do sistema
                </p>
                {filteredSystemClients.map((client) => {
                  const phone = (client as any).whatsapp || client.phone || "";
                  return (
                    <button
                      key={client.id}
                      onClick={() => selectClient(client)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors border-b text-left"
                    >
                      <div className="h-9 w-9 shrink-0 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{client.name}</span>
                        <span className="text-xs text-muted-foreground">{phone || "Sem telefone"}</span>
                      </div>
                      <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
                {filteredConversations.length > 0 && (
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-medium bg-muted/30">
                    Conversas
                  </p>
                )}
              </div>
            )}

            {/* Conversations */}
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : filteredConversations.length === 0 && filteredSystemClients.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">{search ? "Nenhum resultado." : "Nenhuma conversa ainda."}</p>
                {isAdmin && !search && (
                  <p className="text-xs mt-2 font-mono opacity-60">
                    msgs: {diagCount ?? "…"} | clients: {diagClientCount ?? "…"} | convs: {conversations?.length ?? 0}
                  </p>
                )}
              </div>
            ) : (
              <AnimatePresence>
                {filteredConversations.map((conv) => {
                  const hasUnread = conv.unread_count > 0;
                  const isSelected = selectedChat?.client_id === conv.client_id;
                  return (
                    <motion.button
                      key={conv.client_id}
                      layout
                      onClick={() => selectConversation(conv)}
                      className={`w-full flex items-start gap-3 p-3 transition-colors text-left ${
                        hasUnread
                          ? "bg-[#f97316]/10 border border-[#c2410c] animate-unread-pulse rounded-lg mb-1"
                          : `border-b last:border-0 ${isSelected && !isMobile ? "bg-muted/60 hover:bg-muted/70" : "hover:bg-muted/50"}`
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                          hasUnread ? "bg-[#f97316]/20 text-[#f97316]" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {conv.client_name.charAt(0).toUpperCase()}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5">
                          <ChannelIcon channel="whatsapp" size={11} />
                        </span>
                        {hasUnread && (
                          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-[#c2410c] rounded-full border-2 border-background animate-dot-pulse" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-sm truncate ${hasUnread ? "text-[#f97316] font-bold" : "font-medium"}`}>
                            {conv.client_name}
                          </span>
                          <span className={`text-[10px] shrink-0 ml-1 ${hasUnread ? "text-[#f97316] font-semibold" : "text-muted-foreground"}`}>
                            {formatRelativeTime(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className={`text-xs truncate ${hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"}`}>
                            {conv.last_message}
                          </p>
                          {hasUnread && (
                            <span className="ml-1 shrink-0 h-4 min-w-4 rounded-full bg-[#c2410c] text-white text-[10px] flex items-center justify-center px-1">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>
      )}

      {/* Área de chat */}
      {showChat && (
        <div className={`${isMobile ? "w-full" : "flex-1"} flex flex-col overflow-hidden`}>
          {selectedChat ? (
            <motion.div key={selectedChat.client_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center gap-2">
                {/* Botão voltar mobile */}
                {isMobile && (
                  <button
                    onClick={handleBackToList}
                    className="p-1.5 -ml-1 rounded-lg hover:bg-muted transition-colors shrink-0"
                    aria-label="Voltar para conversas"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700 shrink-0">
                  {selectedChat.client_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{selectedChat.client_name}</p>
                  {selectedChat.client_phone && (
                    <p className="text-xs text-muted-foreground">{selectedChat.client_phone}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {clientCards?.pgId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-7 px-2"
                      onClick={() => navigate(`/pedidos-garantia/${clientCards.pgId}`)}
                      title="Abrir Pedido de Garantia"
                    >
                      <LayoutGrid className="h-3 w-3" />
                      PG
                    </Button>
                  )}
                  {clientCards?.paId && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-7 px-2"
                      onClick={() => navigate(`/pedidos-acessorios/${clientCards.paId}`)}
                      title="Abrir Pedido de Acessórios"
                    >
                      <LayoutGrid className="h-3 w-3" />
                      PA
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs h-7 px-2"
                    onClick={handleCrmCard}
                    disabled={creatingCard}
                    title={clientCards?.crmTicketId ? "Abrir card no CRM" : "Criar card no CRM"}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    {creatingCard ? "..." : clientCards?.crmTicketId ? "CRM" : "+ CRM"}
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col">
                <WhatsAppChat
                  clientId={selectedChat.client_id}
                  clientPhone={selectedChat.client_phone}
                  clientName={selectedChat.client_name}
                  hideHeader
                  className="flex flex-col flex-1 min-h-0 p-4"
                />
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Selecione uma conversa</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
