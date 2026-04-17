import { useState, useEffect } from "react";
import { MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function ChatPage() {
  const { data: conversations, isLoading } = useWhatsAppConversations();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("chat-page-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "whatsapp_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const filtered = (conversations || []).filter((c) =>
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.client_phone || "").includes(search)
  );

  const selected = filtered.find((c) => c.client_id === selectedClientId) || filtered[0];

  useEffect(() => {
    if (!selectedClientId && filtered.length > 0) {
      setSelectedClientId(filtered[0].client_id);
    }
  }, [filtered, selectedClientId]);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="w-80 shrink-0 flex flex-col border-r">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhuma conversa ainda.</p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.client_id}
                onClick={() => setSelectedClientId(conv.client_id)}
                className={`w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b last:border-0 text-left ${
                  selectedClientId === conv.client_id ? "bg-muted/60" : ""
                }`}
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                  {conv.client_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium truncate">{conv.client_name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                      {formatRelativeTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
                    {conv.unread_count > 0 && (
                      <span className="ml-1 shrink-0 h-4 min-w-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center px-1">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <motion.div key={selected.client_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-bold text-emerald-700">
                {selected.client_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{selected.client_name}</p>
                {selected.client_phone && (
                  <p className="text-xs text-muted-foreground">{selected.client_phone}</p>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-4">
              <WhatsAppChat
                clientId={selected.client_id}
                clientPhone={selected.client_phone || ""}
                clientName={selected.client_name}
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
