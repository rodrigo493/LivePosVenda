import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TicketDetailDialog } from "@/components/tickets/TicketDetailDialog";
import { ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

export type DrilldownItem = {
  id: string;
  type: "ticket" | "warranty" | "work_order" | "equipment";
  title: string;
  subtitle?: string;
  status?: string;
  extra?: string;
  raw?: any; // full object for opening detail dialogs
};

interface KpiDrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: DrilldownItem[];
}

export function KpiDrilldownDialog({ open, onOpenChange, title, items }: KpiDrilldownDialogProps) {
  const navigate = useNavigate();
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);

  const handleItemClick = (item: DrilldownItem) => {
    if (item.type === "ticket" || item.type === "warranty") {
      if (item.raw) {
        setSelectedTicket(item.raw);
      }
    } else if (item.type === "work_order") {
      onOpenChange(false);
      navigate(`/ordens-servico/${item.id}`);
    } else if (item.type === "equipment") {
      onOpenChange(false);
      navigate("/equipamentos");
    }
  };

  const typeLabels: Record<string, string> = {
    ticket: "Chamado",
    warranty: "Garantia",
    work_order: "OS",
    equipment: "Equipamento",
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-base font-display">
              {title}
              <Badge variant="secondary" className="ml-2 text-[10px]">{items.length}</Badge>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro encontrado.</p>
            ) : (
              <div className="space-y-1.5">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="w-full text-left flex items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.status && <StatusBadge status={item.status} />}
                      {item.extra && (
                        <Badge variant="outline" className="text-[9px] h-4">{item.extra}</Badge>
                      )}
                      <Badge variant="secondary" className="text-[9px] h-4">{typeLabels[item.type]}</Badge>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {selectedTicket && (
        <TicketDetailDialog
          ticket={selectedTicket}
          open={!!selectedTicket}
          onOpenChange={(v) => { if (!v) setSelectedTicket(null); }}
        />
      )}
    </>
  );
}
