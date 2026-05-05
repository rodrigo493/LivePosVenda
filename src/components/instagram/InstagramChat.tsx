// src/components/instagram/InstagramChat.tsx
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChannelIcon } from "@/components/ui/ChannelIcon";
import { Send, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { InstagramConversation } from "@/hooks/useInstagramConversations";

interface InstagramChatProps {
  conversation: InstagramConversation;
}

interface IGMessage {
  id: string;
  message_type: "dm" | "comment" | "story_mention";
  direction: "inbound" | "outbound";
  content: string | null;
  media_url: string | null;
  post_id: string | null;
  post_url: string | null;
  ig_message_id: string | null;
  created_at: string;
}

function useInstagramMessages(conversationId: string) {
  return useQuery<IGMessage[]>({
    queryKey: ["instagram-messages", conversationId],
    staleTime: 0,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("instagram_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

const TYPE_LABEL: Record<string, string> = {
  dm: "DM",
  comment: "Comentário",
  story_mention: "Menção em Story",
};

export function InstagramChat({ conversation }: InstagramChatProps) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data: messages = [], isLoading } = useInstagramMessages(conversation.id);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: async ({ content, lastMessage }: { content: string; lastMessage: IGMessage | null }) => {
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            conversation_id: conversation.id,
            content,
            message_type: lastMessage?.message_type ?? "dm",
            ig_message_id: lastMessage?.ig_message_id ?? null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao enviar");
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["instagram-messages", conversation.id] });
      qc.invalidateQueries({ queryKey: ["instagram-conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lastInbound = [...messages].reverse().find((m) => m.direction === "inbound") ?? null;

  const handleSend = () => {
    if (!text.trim() || sendMut.isPending) return;
    sendMut.mutate({ content: text.trim(), lastMessage: lastInbound });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && <p className="text-xs text-muted-foreground text-center">Carregando...</p>}
        {messages.map((msg) => {
          const isOut = msg.direction === "outbound";
          return (
            <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                isOut
                  ? "bg-gradient-to-br from-pink-500 to-purple-600 text-white rounded-br-sm"
                  : "bg-muted rounded-bl-sm"
              }`}>
                {!isOut && msg.message_type !== "dm" && (
                  <p className="text-[10px] font-medium opacity-60 mb-0.5 flex items-center gap-1">
                    <ChannelIcon channel="instagram" size={10} />
                    {TYPE_LABEL[msg.message_type] ?? msg.message_type}
                    {msg.post_id && (
                      <a
                        href={msg.post_url ?? `https://www.instagram.com/p/${msg.post_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-1 opacity-70 hover:opacity-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </p>
                )}
                {msg.content && <p className="leading-relaxed">{msg.content}</p>}
                {msg.media_url && (
                  <a href={msg.media_url} target="_blank" rel="noreferrer" className="text-xs underline opacity-70">
                    Ver mídia
                  </a>
                )}
                <p className={`text-[10px] mt-1 opacity-60 ${isOut ? "text-right" : ""}`}>
                  {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Campo de resposta */}
      <div className="p-3 border-t flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={
            lastInbound?.message_type === "comment"
              ? "Responder comentário..."
              : lastInbound?.message_type === "story_mention"
              ? "Responder menção via DM..."
              : "Enviar DM..."
          }
          className="flex-1 h-9 text-sm"
          disabled={sendMut.isPending}
        />
        <Button
          size="sm"
          className="h-9 w-9 p-0 bg-gradient-to-br from-pink-500 to-purple-600 border-0 hover:opacity-90"
          onClick={handleSend}
          disabled={!text.trim() || sendMut.isPending}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
