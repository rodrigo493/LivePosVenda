import { useNavigate } from "react-router-dom";
import { UserPlus, X, RotateCcw } from "lucide-react";
import { useOverdueTasks } from "@/hooks/useOverdueTasks";
import { useNewLeads, useClearNewLead, useClearAllNewLeads } from "@/hooks/useNewLeads";
import { useResetMyAlerts } from "@/hooks/useResetMyAlerts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const { data: overdueCount = 0 } = useOverdueTasks();
  const { data: newLeads = [] } = useNewLeads();
  const clearNewLead = useClearNewLead();
  const clearAllNewLeads = useClearAllNewLeads();
  const { reset: resetMyAlerts, isResetting } = useResetMyAlerts();

  const hasAny = overdueCount > 0 || newLeads.length > 0;
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

    </div>
  );
}
