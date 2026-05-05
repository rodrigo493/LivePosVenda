import { useState, useEffect, useMemo, useRef } from "react";
import { MessageSquare, Search, UserPlus, LayoutGrid, ArrowLeft } from "lucide-react";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { useWhatsAppConversations, useMarkConversationRead } from "@/hooks/useWhatsAppConversations";
import { useInstagramConversations, useMarkInstagramConversationRead, InstagramConversation } from "@/hooks/useInstagramConversations";
import { InstagramChat } from "@/components/instagram/InstagramChat";
import { useUserWhatsAppInstances } from "@/hooks/useUserWhatsAppInstances";
import { useClients } from "@/hooks/useClients";
import { useAllUsers } from "@/hooks/useUserAccess";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Client } from "@/types/database";
import { useWhatsAppAvatar } from "@/hooks/useWhatsAppAvatar";

function useInstanceUserMap(): Map<string, string> {
  const { data } = useQuery<Map<string, string>>({
    queryKey: ["instance-user-map"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data: insts } = await (supabase as any)
        .from("pipeline_whatsapp_instances")
        .select("id, user_id")
        .eq("active", true)
        .not("user_id", "is", null);
      const map = new Map<string, string>();
      for (const inst of (insts ?? []) as any[]) {
        if (inst.id && inst.user_id) map.set(inst.id as string, inst.user_id as string);
      }
      return map;
    },
  });
  return data ?? new Map();
}

interface ChatUser {
  id: string;
  full_name: string | null;
}

function useChatUsers() {
  return useQuery<ChatUser[]>({
    queryKey: ["chat-users"],
    staleTime: 60_000,
    queryFn: async () => {
      // Apenas usuários que têm pelo menos uma instância WhatsApp ativa
      const { data: instances } = await (supabase as any)
        .from("pipeline_whatsapp_instances")
        .select("user_id")
        .eq("active", true)
        .not("user_id", "is", null);

      const userIds = [...new Set(((instances ?? []) as any[]).map((i) => i.user_id))] as string[];
      if (!userIds.length) return [];

      const { data } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
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
  client_avatar?: string | null;
  last_instance_id?: string | null;
}

function ConvAvatar({
  pic,
  initial,
  hasUnread,
  size,
  fallbackClass,
}: {
  pic: string | null | undefined;
  initial: string;
  hasUnread: boolean;
  size: number; // tailwind size in px (8 = 2rem, 10 = 2.5rem)
  fallbackClass?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = `h-${size} w-${size}`;
  if (pic && !imgError) {
    return (
      <img
        src={pic}
        alt={initial}
        className={`${sizeClass} rounded-full object-cover shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
      fallbackClass ?? (hasUnread ? "bg-[#f97316]/20 text-[#f97316]" : "bg-emerald-100 text-emerald-700")
    }`}>
      {initial}
    </div>
  );
}

export default function ChatPage() {
  const { user, hasRole, rolesLoading } = useAuth();
  const isAdmin = hasRole("admin");
  // Padrão: null = Todos. Muda para user.id quando detectamos que o usuário tem instância vinculada.
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const hasInitFilter = useRef(false);

  // Instâncias do usuário logado (substitui a query myInstance)
  const { data: myInstances = [] } = useUserWhatsAppInstances();
  const hasMultipleInstances = !isAdmin && myInstances.length >= 2;

  // Aba de instância ativa (null = usa lógica original)
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  // Quando há múltiplas instâncias, default para a primeira se nenhuma está selecionada
  const effectiveInstanceId = hasMultipleInstances
    ? (myInstances.some((i) => i.id === activeInstanceId) ? activeInstanceId : (myInstances[0]?.id ?? null))
    : null;

  // Inicializa userFilter para admin assim que roles carregarem (não depende de instâncias)
  useEffect(() => {
    if (!hasInitFilter.current && user?.id && !rolesLoading) {
      hasInitFilter.current = true;
      if (isAdmin) setUserFilter(user.id);
    }
  }, [user?.id, isAdmin, rolesLoading]);

  const { data: conversations, isLoading } = useWhatsAppConversations(
    isAdmin ? userFilter : undefined,
    effectiveInstanceId
  );

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

  const instanceUserMap = useInstanceUserMap();
  // Mapa reverso: user_id → instance_id (para admin enviar pelo responsável)
  const userInstanceMap = useMemo(() => {
    const m = new Map<string, string>();
    instanceUserMap.forEach((userId, instanceId) => m.set(userId, instanceId));
    return m;
  }, [instanceUserMap]);

  const { data: allClients } = useClients();
  const { data: allUsers = [] } = useAllUsers();
  const { data: chatUsers } = useChatUsers();
  const isMobile = useIsMobile();
  const [selectedChat, setSelectedChat] = useState<ActiveChat | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [search, setSearch] = useState("");
  const [creatingCard, setCreatingCard] = useState(false);
  const markRead = useMarkConversationRead();
  const { data: igConversations = [] } = useInstagramConversations();
  const markIgRead = useMarkInstagramConversationRead();
  const [selectedIgChat, setSelectedIgChat] = useState<InstagramConversation | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const clientParam = searchParams.get("client");
  const navigate = useNavigate();

  // Busca foto de perfil do WhatsApp (Uazapi → clients.avatar_url)
  const { data: waAvatar } = useWhatsAppAvatar(
    selectedChat?.client_id,
    selectedChat?.client_phone,
    selectedChat?.last_instance_id
  );

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

  const mergedConversations = useMemo(() => {
    const wa = (conversations ?? []).map((c) => ({ ...c, channel: "whatsapp" as const }));
    const ig = igConversations.map((c) => ({ ...c, channel: "instagram" as const }));
    return [...wa, ...ig].sort(
      (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );
  }, [conversations, igConversations]);

  const filteredConversations = useMemo(() => {
    if (!search.trim()) return mergedConversations;
    const term = search.toLowerCase();
    return mergedConversations.filter((c) => {
      if (c.channel === "instagram") {
        const ig = c as InstagramConversation & { channel: "instagram" };
        return (ig.display_name ?? "").toLowerCase().includes(term);
      }
      return (
        (c as any).client_name?.toLowerCase().includes(term) ||
        ((c as any).client_phone ?? "").includes(term)
      );
    });
  }, [mergedConversations, search]);

  // Conversa selecionada completa (para pegar assigned_to)
  const selectedConv = useMemo(
    () => conversations?.find((c) => c.client_id === selectedChat?.client_id) ?? null,
    [conversations, selectedChat?.client_id]
  );

  // Instância do responsável pela conversa (admin envia pelo número do responsável)
  const adminChatInstanceId = useMemo(() => {
    if (!isAdmin || !selectedConv) return undefined;
    const ownerId = selectedConv.assigned_to
      ?? (selectedConv.last_instance_id ? instanceUserMap.get(selectedConv.last_instance_id) ?? null : null);
    return ownerId ? userInstanceMap.get(ownerId) : undefined;
  }, [isAdmin, selectedConv, instanceUserMap, userInstanceMap]);

  const conversationClientIds = useMemo(() =>
    new Set((conversations || []).map((c) => c.client_id)),
    [conversations]
  );

  const filteredSystemClients = useMemo(() => {
    if (!search.trim()) return [];
    const term = search.toLowerCase();
    const results = (allClients || []).filter((c) => {
      if (conversationClientIds.has(c.id)) return false;
      const phone = (c as any).whatsapp || c.phone || "";
      return (
        c.name.toLowerCase().includes(term) ||
        phone.includes(term)
      );
    });
    // Clientes criados pelo usuário atual aparecem primeiro
    results.sort((a, b) => {
      const aOwn = (a as any).created_by === user?.id ? -1 : 1;
      const bOwn = (b as any).created_by === user?.id ? -1 : 1;
      return aOwn - bOwn;
    });
    return results.slice(0, 20);
  }, [allClients, search, conversationClientIds, user?.id]);

  useEffect(() => {
    if (filteredConversations.length === 0) return;
    if (clientParam) {
      const target = filteredConversations.find((c) => c.channel !== "instagram" && (c as any).client_id === clientParam);
      if (target) {
        setSelectedChat({ client_id: (target as any).client_id, client_name: (target as any).client_name, client_phone: (target as any).client_phone || "", client_avatar: (target as any).client_avatar ?? null, last_instance_id: (target as any).last_instance_id ?? null });
        setMobileView("chat");
        setSearchParams({}, { replace: true });
        return;
      }
    }
    const igClientParam = searchParams.get("ig_client");
    if (igClientParam) {
      const igTarget = filteredConversations.find((c) => c.channel === "instagram" && (c as InstagramConversation).client_id === igClientParam);
      if (igTarget) {
        setSelectedIgChat(igTarget as InstagramConversation & { channel: "instagram" });
        setSelectedChat(null);
        setMobileView("chat");
        setSearchParams({}, { replace: true });
        return;
      }
    }
    // No desktop, seleciona automaticamente a primeira conversa (apenas WhatsApp)
    if (!selectedChat && !selectedIgChat && !isMobile) {
      const first = filteredConversations[0];
      if (!first) return;
      if (first.channel === "instagram") return;
      setSelectedChat({ client_id: (first as any).client_id, client_name: (first as any).client_name, client_phone: (first as any).client_phone || "", client_avatar: (first as any).client_avatar ?? null, last_instance_id: (first as any).last_instance_id ?? null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredConversations, clientParam, isMobile]);

  const selectConversation = (conv: typeof filteredConversations[0]) => {
    if (conv.channel === "instagram") {
      const ig = conv as InstagramConversation & { channel: "instagram" };
      setSelectedIgChat(ig);
      setSelectedChat(null);
      markIgRead.mutate(ig.id);
    } else {
      setSelectedIgChat(null);
      setSelectedChat({
        client_id: (conv as any).client_id,
        client_name: (conv as any).client_name,
        client_phone: (conv as any).client_phone || "",
        client_avatar: (conv as any).client_avatar ?? null,
        last_instance_id: (conv as any).last_instance_id ?? null,
      });
      markRead.mutate((conv as any).client_id);
    }
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
    setSelectedIgChat(null);
    setSelectedChat(null);
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
            {/* Abas de instância — visível para usuário não-admin com múltiplas instâncias */}
            {hasMultipleInstances && (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                {myInstances.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => {
                      setActiveInstanceId(inst.id);
                      setSelectedChat(null);
                    }}
                    className={`shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      effectiveInstanceId === inst.id
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "bg-transparent text-muted-foreground border-border hover:border-zinc-400"
                    }`}
                  >
                    {inst.pipeline_name}
                  </button>
                ))}
              </div>
            )}
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
                    onClick={() => { if (u.id !== userFilter) setUserFilter(u.id); }}
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
                {isAdmin && !search && userFilter !== null && (
                  <p className="text-xs mt-2 opacity-60 leading-relaxed">
                    Vincule esta instância ao usuário<br />em Configurações → WhatsApp.
                  </p>
                )}
                {isAdmin && !search && userFilter === null && (
                  <p className="text-xs mt-2 font-mono opacity-60">
                    msgs: {diagCount ?? "…"} | clients: {diagClientCount ?? "…"} | convs: {conversations?.length ?? 0}
                  </p>
                )}
              </div>
            ) : (
              <AnimatePresence>
                {filteredConversations.map((conv) => {
                  const hasUnread = conv.unread_count > 0;
                  const isSelected = conv.channel === "instagram"
                    ? selectedIgChat?.id === (conv as InstagramConversation).id
                    : selectedChat?.client_id === (conv as any).client_id;
                  return (
                    <motion.button
                      key={conv.channel === "instagram" ? `ig-${(conv as InstagramConversation).id}` : (conv as any).client_id}
                      layout
                      onClick={() => selectConversation(conv)}
                      className={`w-full flex items-start gap-3 p-3 transition-colors text-left ${
                        hasUnread
                          ? "bg-[#f97316]/10 border border-[#c2410c] animate-unread-pulse rounded-lg mb-1"
                          : `border-b last:border-0 ${isSelected && !isMobile ? "bg-muted/60 hover:bg-muted/70" : "hover:bg-muted/50"}`
                      }`}
                    >
                      <div className="relative shrink-0">
                        <ConvAvatar
                          pic={conv.channel === "instagram"
                            ? (conv as InstagramConversation).sender_picture
                            : (conv as any).client_avatar ?? null}
                          initial={conv.channel === "instagram"
                            ? ((conv as InstagramConversation).sender_username?.charAt(0).toUpperCase() ?? "I")
                            : (conv as any).client_name?.charAt(0).toUpperCase() ?? "?"}
                          hasUnread={hasUnread}
                          size={10}
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5">
                          <ChannelIcon channel={conv.channel ?? "whatsapp"} size={11} />
                        </span>
                        {hasUnread && (
                          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-[#c2410c] rounded-full border-2 border-background animate-dot-pulse" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-sm truncate ${hasUnread ? "text-[#f97316] font-bold" : "font-medium"}`}>
                            {conv.channel === "instagram"
                              ? (conv as InstagramConversation).display_name
                              : (conv as any).client_name}
                          </span>
                          <span className={`text-[10px] shrink-0 ml-1 ${hasUnread ? "text-[#f97316] font-semibold" : "text-muted-foreground"}`}>
                            {formatRelativeTime(conv.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-xs truncate ${hasUnread ? "text-foreground/80 font-medium" : "text-muted-foreground"}`}>
                            {conv.channel === "instagram"
                              ? ((conv as InstagramConversation).last_message ?? "Nova conversa")
                              : (conv as any).last_message}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            {isAdmin && conv.channel !== "instagram" && (() => {
                              const ownerId = (conv as any).assigned_to
                                ?? ((conv as any).last_instance_id ? instanceUserMap.get((conv as any).last_instance_id) ?? null : null);
                              const name = allUsers.find(u => u.user_id === ownerId)?.full_name?.split(" ")[0];
                              return name ? (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 leading-tight whitespace-nowrap">
                                  {name}
                                </span>
                              ) : null;
                            })()}
                            {hasUnread && (
                              <span className="h-4 min-w-4 rounded-full bg-[#c2410c] text-white text-[10px] flex items-center justify-center px-1">
                                {conv.unread_count}
                              </span>
                            )}
                          </div>
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
          {selectedIgChat ? (
            <motion.div key={selectedIgChat.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-hidden">
              {/* Header Instagram */}
              <div className="px-4 py-3 border-b flex items-center gap-2">
                {isMobile && (
                  <button
                    onClick={handleBackToList}
                    className="p-1.5 -ml-1 rounded-lg hover:bg-muted transition-colors shrink-0"
                    aria-label="Voltar para conversas"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <ConvAvatar
                  pic={selectedIgChat.sender_picture}
                  initial={selectedIgChat.sender_username?.charAt(0).toUpperCase() ?? "I"}
                  hasUnread={false}
                  size={8}
                  fallbackClass="bg-gradient-to-br from-orange-400 to-purple-600 text-white"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{selectedIgChat.display_name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ChannelIcon channel="instagram" size={10} /> Instagram
                  </p>
                </div>
              </div>
              <InstagramChat conversation={selectedIgChat} />
            </motion.div>
          ) : selectedChat ? (
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
                <ConvAvatar
                  pic={waAvatar ?? selectedChat.client_avatar ?? null}
                  initial={selectedChat.client_name.charAt(0).toUpperCase()}
                  hasUnread={false}
                  size={8}
                />
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
                  instanceId={isAdmin ? adminChatInstanceId : (effectiveInstanceId ?? undefined)}
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
