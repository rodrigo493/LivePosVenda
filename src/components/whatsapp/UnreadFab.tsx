// src/components/whatsapp/UnreadFab.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function UnreadFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: conversations = [] } = useWhatsAppConversations();

  const unreadConvs = conversations.filter((c) => c.unread_count > 0);
  const totalUnread = unreadConvs.reduce((sum, c) => sum + c.unread_count, 0);

  if (totalUnread === 0) return null;

  const handleConvClick = (clientId: string) => {
    setOpen(false);
    navigate(`/chat?client=${clientId}`);
  };

  return (
    <div className="fixed bottom-6 right-24 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="bg-card border border-[#c2410c]/40 rounded-xl shadow-xl overflow-hidden w-64 mb-1"
          >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className="text-xs font-bold text-[#f97316] uppercase tracking-wide">
                {totalUnread} {totalUnread === 1 ? "não lida" : "não lidas"}
              </span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {unreadConvs.slice(0, 5).map((conv) => (
                <button
                  key={conv.client_id}
                  onClick={() => handleConvClick(conv.client_id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-border/50 hover:bg-muted/50 text-left transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-[#f97316]/20 flex items-center justify-center text-xs font-bold text-[#f97316] shrink-0">
                    {conv.client_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#f97316] truncate">{conv.client_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{conv.last_message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-[9px] text-muted-foreground">{formatRelativeTime(conv.last_message_at)}</span>
                    <span className="bg-[#c2410c] text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-4 text-center leading-none">
                      {conv.unread_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {unreadConvs.length > 5 && (
              <button
                onClick={() => { setOpen(false); navigate("/chat"); }}
                className="w-full px-3 py-2 text-xs text-[#f97316] hover:bg-muted/50 text-center transition-colors border-t border-border"
              >
                Ver todas ({unreadConvs.length}) →
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-[#c2410c] hover:bg-[#9a3412] text-white rounded-full px-4 py-2.5 shadow-lg transition-colors animate-unread-pulse"
        aria-label="Mensagens não lidas"
      >
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-bold">{totalUnread}</span>
      </button>
    </div>
  );
}
