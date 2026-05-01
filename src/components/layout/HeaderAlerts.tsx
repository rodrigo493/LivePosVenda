import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useOverdueTasks } from "@/hooks/useOverdueTasks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Calcula horas úteis entre dois instantes.
// Para contar: seg–sex, das 08:00 às 17:00.
// Sáb, dom e fora desse horário NÃO contam.
function calcBusinessHours(from: Date, to: Date): number {
  if (from >= to) return 0;
  let hours = 0;
  const cursor = new Date(from);

  while (cursor < to) {
    const day = cursor.getDay();
    if (day === 0) {                            // domingo → segunda 08h
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(8, 0, 0, 0);
      continue;
    }
    if (day === 6) {                            // sábado → segunda 08h
      cursor.setDate(cursor.getDate() + 2);
      cursor.setHours(8, 0, 0, 0);
      continue;
    }
    const h = cursor.getHours();
    if (h < 8) { cursor.setHours(8, 0, 0, 0); continue; }
    if (h >= 17) {                              // após 17h → próximo dia 08h
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(8, 0, 0, 0);
      continue;
    }
    const endOfSlot = new Date(cursor);
    endOfSlot.setHours(17, 0, 0, 0);
    const until = to < endOfSlot ? to : endOfSlot;
    hours += (until.getTime() - cursor.getTime()) / 3_600_000;
    cursor.setTime(until.getTime());
    if (cursor >= endOfSlot) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(8, 0, 0, 0);
    }
  }
  return hours;
}

function formatRelative(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Pílula laranja com glow pulsante
function AlertPill({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const pill = (
    <button
      onClick={onClick}
      className="animate-alert-pill px-4 py-[5px] rounded-full border border-orange-500 bg-black text-white text-[11px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer transition-opacity hover:opacity-90"
    >
      {label}
    </button>
  );

  if (children) return <>{children}</>;
  return pill;
}

export function HeaderAlerts() {
  const navigate = useNavigate();
  const { data: conversations = [] } = useWhatsAppConversations();
  const { data: overdueCount = 0 } = useOverdueTasks();

  const unreadConvs = useMemo(
    () => conversations.filter((c) => c.unread_count > 0),
    [conversations]
  );
  const totalUnread = useMemo(
    () => unreadConvs.reduce((s, c) => s + c.unread_count, 0),
    [unreadConvs]
  );

  // CARD SEM RESPOSTA: última mensagem é do cliente (inbound),
  // ocorreu nos últimos 30 dias e passaram ≥ 12 horas úteis sem resposta
  const unansweredCount = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return conversations.filter((c) => {
      const lastAt = new Date(c.last_message_at);
      return (
        c.last_message_direction === "inbound" &&
        lastAt >= cutoff &&
        calcBusinessHours(lastAt, now) >= 12
      );
    }).length;
  }, [conversations]);

  const hasAny = totalUnread > 0 || overdueCount > 0 || unansweredCount > 0;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-2">

      {/* ── NOVA MENSAGEM ── */}
      {totalUnread > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="animate-alert-pill px-4 py-[5px] rounded-full border border-orange-500 bg-black text-white text-[11px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity">
              NOVA MENSAGEM
            </button>
          </PopoverTrigger>

          <PopoverContent align="center" sideOffset={10} className="w-72 p-0 border-orange-500/50 shadow-[0_0_20px_rgba(234,88,12,0.25)]">
            <div className="px-3 py-2.5 border-b flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">
                {totalUnread} {totalUnread === 1 ? "mensagem não lida" : "mensagens não lidas"}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {unreadConvs.slice(0, 6).map((conv) => (
                <button
                  key={conv.client_id}
                  onClick={() => navigate(`/chat?client=${conv.client_id}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-border/50 hover:bg-muted/60 text-left transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400 shrink-0">
                    {conv.client_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{conv.client_name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{conv.last_message}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-[9px] text-muted-foreground">{formatRelative(conv.last_message_at)}</span>
                    <span className="bg-orange-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 min-w-4 text-center leading-none">
                      {conv.unread_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {unreadConvs.length > 6 && (
              <button
                onClick={() => navigate("/chat")}
                className="w-full px-3 py-2 text-xs text-orange-400 hover:bg-muted/50 text-center transition-colors border-t border-border"
              >
                Ver todas ({unreadConvs.length}) →
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* ── TAREFA ATRASADA ── */}
      {overdueCount > 0 && (
        <button
          onClick={() => navigate("/tarefas")}
          className="animate-alert-pill px-4 py-[5px] rounded-full border border-orange-500 bg-black text-white text-[11px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity"
        >
          TAREFA ATRASADA
        </button>
      )}

      {/* ── CARD SEM RESPOSTA ── */}
      {unansweredCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="animate-alert-pill px-4 py-[5px] rounded-full border border-orange-500 bg-black text-white text-[11px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity">
              CARD SEM RESPOSTA
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" sideOffset={10} className="w-72 p-0 border-orange-500/50 shadow-[0_0_20px_rgba(234,88,12,0.25)]">
            <div className="px-3 py-2.5 border-b flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">
                {unansweredCount} {unansweredCount === 1 ? "card sem resposta" : "cards sem resposta"} (+12h)
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {conversations
                .filter((c) => {
                  const now = new Date();
                  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                  const lastAt = new Date(c.last_message_at);
                  return c.last_message_direction === "inbound" && lastAt >= cutoff && calcBusinessHours(lastAt, now) >= 12;
                })
                .slice(0, 6)
                .map((conv) => (
                  <button
                    key={conv.client_id}
                    onClick={() => navigate(`/chat?client=${conv.client_id}`)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-border/50 hover:bg-muted/60 text-left transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400 shrink-0">
                      {conv.client_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{conv.client_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{conv.last_message}</p>
                    </div>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {formatRelative(conv.last_message_at)}
                    </span>
                  </button>
                ))}
            </div>
            {unansweredCount > 6 && (
              <button
                onClick={() => navigate("/chat")}
                className="w-full px-3 py-2 text-xs text-orange-400 hover:bg-muted/50 text-center transition-colors border-t border-border"
              >
                Ver todos ({unansweredCount}) →
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
