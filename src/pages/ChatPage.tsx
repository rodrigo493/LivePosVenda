import { useState, useEffect, useMemo } from "react";
import { MessageSquare, Search, UserPlus, LayoutGrid } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { useWhatsAppConversations, useMarkConversationRead } from "@/hooks/useWhatsAppConversations";
import { useClients } from "@/hooks/useClients";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Client } from "@/types/database";

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
  const { data: conversations, isLoading } = useWhatsAppConversations();
  const { data: allClients } = useClients();
  const { user } = useAuth();
  const [selectedChat, setSelectedChat] = useState<ActiveChat | null>(null);
  const [search, setSearch] = useState("");
  const [creatingCard, setCreatingCard] = useState(false);
  const markRead = useMarkConversationRead();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientParam = searchParams.get("client");
  const navigate = useNavigate();

  const { data: clientTicket } = useQuery({
    queryKey: ["client-crm-ticket", selectedChat?.client_id],
    enabled: !!selectedChat?.client_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tickets")
        .select("id")
        .eq("client_id", selectedChat!.client_id)
        .not("pipeline_stage", "is", null)
        .not("pipeline_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { id: string } | null;
    },
  });

  const handleCrmCard = async () => {
    if (!selectedChat) return;
    if (clientTicket?.id) {
      navigate(`/crm?open_ticket=${clientTicket.id}`);
      return;
    }
    setCreatingCard(true);
    try {
      const { data, error } = await (supabase as any)
        .from("tickets")
        .insert({
          client_id: selectedChat.client_id,
          ticket_type: "chamado_tecnico",
          title: `Atendimento - ${selectedChat.client_name}`,
          ticket_number: "",
          pipeline_stage: "sem_atendimento",
          created_by: user?.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      navigate(`/crm?open_ticket=${data.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar card no CRM");
    } finally {
      setCreatingCard(false);
    }
  };

  useEffect(() => {
    if (selectedChat?.client_id) markRead.mutate(selectedChat.client_id);
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
        setSearchParams({}, { replace: true });
        return;
      }
    }
    if (!selectedChat) {
      const first = filteredConversations[0];
      setSelectedChat({ client_id: first.client_id, client_name: first.client_name, client_phone: first.client_phone || "" });
    }
  }, [filteredConversations, clientParam, setSearchParams, selectedChat]);

  const selectConversation = (conv: typeof filteredConversations[0]) => {
    setSelectedChat({ client_id: conv.client_id, client_name: conv.client_name, client_phone: conv.client_phone || "" });
  };

  const selectClient = (client: Client) => {
    const phone = (client as any).whatsapp || client.phone || "";
    setSelectedChat({ client_id: client.id, client_name: client.name, client_phone: phone });
    setSearch("");
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] overflow-hidden rounded-xl border bg-card">
      <div className="w-80 shrink-0 flex flex-col border-r">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa ou cliente..."
              className="pl-8 h-8 text-sm"
            />
          </div>
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
                        : `border-b last:border-0 ${isSelected ? "bg-muted/60 hover:bg-muted/70" : "hover:bg-muted/50"}`
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
                        hasUnread ? "bg-[#f97316]/20 text-[#f97316]" : "bg-emerald-100 text-emerald-700"
                      }`}>
                        {conv.client_name.charAt(0).toUpperCase()}
                      </div>
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

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedChat ? (
          <motion.div key={selectedChat.client_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                {selectedChat.client_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{selectedChat.client_name}</p>
                {selectedChat.client_phone && (
                  <p className="text-xs text-muted-foreground">{selectedChat.client_phone}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-1.5 text-xs h-7 px-2.5"
                onClick={handleCrmCard}
                disabled={creatingCard}
                title={clientTicket?.id ? "Abrir card no CRM" : "Criar card no CRM"}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {creatingCard ? "Criando..." : clientTicket?.id ? "Card" : "Novo card"}
              </Button>
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
    </div>
  );
}
