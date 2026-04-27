import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const { data: conversations } = useWhatsAppConversations();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const unreadConvs = (conversations || []).filter((c) => c.unread_count > 0);
  const totalUnread = unreadConvs.reduce((sum, c) => sum + c.unread_count, 0);

  if (totalUnread === 0) return null;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className="fixed bottom-20 right-6 z-40 flex flex-col items-end gap-2">
        {isOpen && (
          <div className="bg-background border rounded-xl shadow-xl w-72 overflow-hidden mb-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 border-b">
              Mensagens não lidas
            </p>
            {unreadConvs.slice(0, 5).map((conv) => (
              <button
                key={conv.client_id}
                onClick={() => {
                  setIsOpen(false);
                  navigate(`/chat?client=${conv.client_id}`);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors border-b last:border-0 text-left"
              >
                <div className="h-8 w-8 shrink-0 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-700">
                  {conv.client_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#f97316] truncate">{conv.client_name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1 shrink-0">{formatRelativeTime(conv.last_message_at)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{conv.last_message}</p>
                </div>
                <span className="shrink-0 h-4 min-w-4 rounded-full bg-[#c2410c] text-white text-[10px] flex items-center justify-center px-1">
                  {conv.unread_count}
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => setIsOpen((o) => !o)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#c2410c] hover:bg-[#9a3412] text-white shadow-lg text-sm font-semibold transition-all hover:scale-105 focus:outline-none animate-unread-pulse"
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          <span>{totalUnread} não {totalUnread === 1 ? "lida" : "lidas"}</span>
        </button>
      </div>
    </>
  );
}
