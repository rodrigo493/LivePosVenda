import { useState, useEffect, useRef } from "react";
import { Send, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CHAT_HISTORY_LIMIT } from "@/constants/limits";

interface WhatsAppChatProps {
  clientId: string;
  ticketId?: string;
  clientPhone?: string;
  clientName?: string;
}

function useWhatsAppMessages(clientId: string | undefined) {
  return useQuery({
    queryKey: ["whatsapp-messages", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: true })
        .limit(CHAT_HISTORY_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export function WhatsAppChat({ clientId, ticketId, clientPhone, clientName }: WhatsAppChatProps) {
  const qc = useQueryClient();
  const { data: messages, isLoading } = useWhatsAppMessages(clientId);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Realtime subscription
  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`whatsapp-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `client_id=eq.${clientId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, qc]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!draft.trim() || !clientPhone) return;
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            client_id: clientId,
            ticket_id: ticketId,
            message: draft.trim(),
            phone: clientPhone,
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao enviar");

      setDraft("");
      qc.invalidateQueries({ queryKey: ["whatsapp-messages", clientId] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  // Group messages by date
  const groupedMessages = (messages || []).reduce<{ date: string; msgs: any[] }[]>((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString("pt-BR");
    const last = acc[acc.length - 1];
    if (last && last.date === date) {
      last.msgs.push(msg);
    } else {
      acc.push({ date, msgs: [msg] });
    }
    return acc;
  }, []);

  if (!clientPhone) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">Este cliente não possui WhatsApp ou telefone cadastrado.</p>
        <p className="text-xs mt-1">Adicione um número no cadastro do cliente para usar o chat.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[60vh]">
      {/* Chat header */}
      <div className="flex items-center gap-3 pb-3 border-b mb-2">
        <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold">{clientName || "Cliente"}</p>
          <p className="text-[11px] text-muted-foreground">{clientPhone}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-muted-foreground">WhatsApp</span>
        </div>
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 pr-2" ref={scrollRef}>
        <div className="space-y-1 py-2">
          {isLoading ? (
            <p className="text-center text-xs text-muted-foreground py-8">Carregando mensagens...</p>
          ) : groupedMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">Nenhuma mensagem ainda.</p>
              <p className="text-[10px] mt-1">Envie a primeira mensagem para iniciar a conversa.</p>
            </div>
          ) : (
            groupedMessages.map((group) => (
              <div key={group.date}>
                <div className="flex justify-center my-3">
                  <span className="text-[10px] bg-muted px-3 py-0.5 rounded-full text-muted-foreground">
                    {group.date}
                  </span>
                </div>
                {group.msgs.map((msg: any) => (
                  <div
                    key={msg.id}
                    className={`flex mb-1.5 ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                        msg.direction === "outbound"
                          ? "bg-emerald-600 text-white rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      }`}
                    >
                      {msg.direction === "inbound" && msg.sender_name && (
                        <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{msg.sender_name}</p>
                      )}
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.message_text}</p>
                      <p
                        className={`text-[9px] mt-1 text-right ${
                          msg.direction === "outbound" ? "text-white/60" : "text-muted-foreground"
                        }`}
                      >
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t pt-3 mt-2">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
            rows={1}
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !draft.trim()}
            size="icon"
            className="h-10 w-10 shrink-0 bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  );
}
