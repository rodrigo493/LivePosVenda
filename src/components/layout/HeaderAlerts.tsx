import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, UserPlus, X, RotateCcw } from "lucide-react";
import { useWhatsAppConversations } from "@/hooks/useWhatsAppConversations";
import { useOverdueTasks } from "@/hooks/useOverdueTasks";
import { useUnansweredAck } from "@/hooks/useUnansweredAck";
import { useNewLeads, useClearNewLead, useClearAllNewLeads } from "@/hooks/useNewLeads";
import { useResetMyAlerts } from "@/hooks/useResetMyAlerts";
import { useAuth } from "@/hooks/useAuth";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function calcBusinessHours(from: Date, to: Date): number {
  if (from >= to) return 0;
  let hours = 0;
  const cursor = new Date(from);
  while (cursor < to) {
    const day = cursor.getDay();
    if (day === 0) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(8, 0, 0, 0); continue; }
    if (day === 6) { cursor.setDate(cursor.getDate() + 2); cursor.setHours(8, 0, 0, 0); continue; }
    const h = cursor.getHours();
    if (h < 8) { cursor.setHours(8, 0, 0, 0); continue; }
    if (h >= 17) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(8, 0, 0, 0); continue; }
    const endOfSlot = new Date(cursor);
    endOfSlot.setHours(17, 0, 0, 0);
    const until = to < endOfSlot ? to : endOfSlot;
    hours += (until.getTime() - cursor.getTime()) / 3_600_000;
    cursor.setTime(until.getTime());
    if (cursor >= endOfSlot) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(8, 0, 0, 0); }
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

export function HeaderAlerts() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  // Admin recebe alertas apenas das próprias conversas (assigned_to ou instância vinculada)
  const { data: conversations = [] } = useWhatsAppConversations(isAdmin ? user?.id : undefined, null, true);
  const { data: overdueCount = 0 } = useOverdueTasks();
  const { ackAt, ack, isAcking } = useUnansweredAck();
  const { data: newLeads = [] } = useNewLeads();
  const clearNewLead = useClearNewLead();
  const clearAllNewLeads = useClearAllNewLeads();
  const { reset: resetMyAlerts, isResetting } = useResetMyAlerts();

  const ackDate = ackAt ? new Date(ackAt) : null;

  const unreadConvs = useMemo(
    () => conversations.filter((c) => c.unread_count > 0),
    [conversations]
  );
  const totalUnread = useMemo(
    () => unreadConvs.reduce((s, c) => s + c.unread_count, 0),
    [unreadConvs]
  );

  // Só conta como "sem resposta" mensagens inbound que chegaram APÓS o último "zerar"
  const unansweredConvs = useMemo(() => {
    const now = new Date();
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return conversations.filter((c) => {
      const lastAt = new Date(c.last_message_at);
      if (c.last_message_direction !== "inbound") return false;
      if (lastAt < cutoff30d) return false;
      if (ackDate && lastAt <= ackDate) return false;
      return calcBusinessHours(lastAt, now) >= 12;
    });
  }, [conversations, ackDate]);

  const hasAny = totalUnread > 0 || overdueCount > 0 || unansweredConvs.length > 0 || newLeads.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-2">

      {/* ── NOVO LEAD ── */}
      {newLeads.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="animate-alert-pill px-4 py-[5px] rounded-full border border-orange-500 bg-yellow-400 text-black text-[11px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity">
              NOVO LEAD
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" sideOffset={10} className="w-72 p-0 border-orange-500/50 shadow-[0_0_20px_rgba(234,88,12,0.25)]">
            <div className="px-3 py-2.5 border-b flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-bold text-green-400 uppercase tracking-wide flex-1">
                {newLeads.length} {newLeads.length === 1 ? "novo lead" : "novos leads"}
              </span>
              <button
                onClick={() => clearAllNewLeads()}
                title="Zerar todos"
                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-green-400 transition-colors shrink-0"
              >
                <X className="h-3 w-3" />
                Zerar
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {newLeads.slice(0, 8).map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => {
                    clearNewLead(lead.id);
                    navigate(`/crm?pipeline=vendas&open_ticket=${lead.id}`);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 border-b last:border-0 border-border/50 hover:bg-muted/60 text-left transition-colors"
                >
                  <div className="h-7 w-7 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-400 shrink-0">
                    {(lead.clients?.name || lead.title || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{lead.clients?.name || lead.title || "Lead"}</p>
                    <p className="text-[10px] text-muted-foreground truncate">Via formulário do site</p>
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">
                    {formatRelative(lead.created_at)}
                  </span>
                </button>
              ))}
            </div>
            {newLeads.length > 8 && (
              <button
                onClick={() => navigate("/crm?pipeline=vendas")}
                className="w-full px-3 py-2 text-xs text-green-400 hover:bg-muted/50 text-center transition-colors border-t border-border"
              >
                Ver todos ({newLeads.length}) →
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}

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

      {/* ── ZERAR MEUS ALERTAS ── */}
      <button
        onClick={resetMyAlerts}
        disabled={isResetting}
        title="Zerar todos os meus alertas"
        className="flex items-center gap-1 px-2 py-[5px] rounded-full border border-muted-foreground/30 bg-transparent text-muted-foreground text-[10px] uppercase tracking-wide hover:border-orange-500/60 hover:text-orange-400 transition-all disabled:opacity-40 whitespace-nowrap"
      >
        <RotateCcw className={`h-3 w-3 ${isResetting ? "animate-spin" : ""}`} />
        Zerar alertas
      </button>

      {/* ── CARD SEM RESPOSTA ── */}
      {unansweredConvs.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="animate-alert-pill px-4 py-[5px] rounded-full border border-orange-500 bg-black text-white text-[11px] font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer hover:opacity-90 transition-opacity">
              CARD SEM RESPOSTA
            </button>
          </PopoverTrigger>
          <PopoverContent align="center" sideOffset={10} className="w-72 p-0 border-orange-500/50 shadow-[0_0_20px_rgba(234,88,12,0.25)]">
            <div className="px-3 py-2.5 border-b flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wide flex-1">
                {unansweredConvs.length} {unansweredConvs.length === 1 ? "card sem resposta" : "cards sem resposta"} (+12h)
              </span>
              <button
                onClick={() => ack()}
                disabled={isAcking}
                title="Zerar todos"
                className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-orange-400 transition-colors disabled:opacity-50 shrink-0"
              >
                <X className="h-3 w-3" />
                Zerar
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {unansweredConvs.slice(0, 6).map((conv) => (
                <button
                  key={conv.client_id}
                  onClick={() => { ack(); navigate(`/chat?client=${conv.client_id}`); }}
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
            {unansweredConvs.length > 6 && (
              <button
                onClick={() => { ack(); navigate("/chat"); }}
                className="w-full px-3 py-2 text-xs text-orange-400 hover:bg-muted/50 text-center transition-colors border-t border-border"
              >
                Ver todos ({unansweredConvs.length}) →
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
