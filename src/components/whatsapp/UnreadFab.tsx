// src/components/whatsapp/UnreadFab.tsx
import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useAuth } from "@/hooks/useAuth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const { data: conversations = [] } = useWhatsAppConversations(isAdmin ? user?.id : undefined);

  const unreadConvs = conversations.filter((c) => c.unread_count > 0);
  const totalUnread = unreadConvs.reduce((sum, c) => sum + c.unread_count, 0);

  if (totalUnread === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 bg-[#c2410c] hover:bg-[#9a3412] text-white rounded-full px-3 py-1.5 transition-colors animate-unread-pulse shrink-0"
          aria-label="Mensagens não lidas no WhatsApp"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="text-xs font-bold tabular-nums">{totalUnread}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="w-72 p-0 border-[#c2410c]/40">
        <div className="px-3 py-2.5 border-b border-border flex items-center gap-2">
          <MessageSquare className="h-3.5 w-3.5 text-[#f97316]" />
          <span className="text-xs font-bold text-[#f97316] uppercase tracking-wide">
            {totalUnread} {totalUnread === 1 ? "mensagem não lida" : "mensagens não lidas"}
          </span>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {unreadConvs.slice(0, 6).map((conv) => (
            <button
              key={conv.client_id}
              onClick={() => navigate(`/chat?client=${conv.client_id}`)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-border/50 hover:bg-muted/50 text-left transition-colors"
            >
              <div className="h-7 w-7 rounded-full bg-[#f97316]/20 flex items-center justify-center text-xs font-bold text-[#f97316] shrink-0">
                {conv.client_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{conv.client_name}</p>
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

        {unreadConvs.length > 6 && (
          <button
            onClick={() => navigate("/chat")}
            className="w-full px-3 py-2 text-xs text-[#f97316] hover:bg-muted/50 text-center transition-colors border-t border-border"
          >
            Ver todas ({unreadConvs.length}) →
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
