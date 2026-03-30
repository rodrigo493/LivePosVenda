import { useMemo } from "react";
import { useTickets } from "@/hooks/useTickets";
import { useWorkOrders } from "@/hooks/useWorkOrders";
import { useWarrantyClaims } from "@/hooks/useWarrantyAndService";
import { useQuotes } from "@/hooks/useQuotes";
import { AlertTriangle, Clock, FileText, ShieldCheck, ClipboardList } from "lucide-react";
import { motion } from "framer-motion";

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function OperationalAlerts() {
  const { data: tickets } = useTickets();
  const { data: orders } = useWorkOrders();
  const { data: claims } = useWarrantyClaims();
  const { data: quotes } = useQuotes();

  const alerts = useMemo(() => {
    const list: { icon: any; label: string; count: number; color: string }[] = [];

    const staleTickets = tickets?.filter(
      (t: any) => ["aberto", "em_analise"].includes(t.status) && daysSince(t.updated_at) > 5
    ).length || 0;
    if (staleTickets > 0) list.push({ icon: Clock, label: "Chamados parados >5 dias", count: staleTickets, color: "text-amber-500" });

    const pendingWarranties = claims?.filter((c: any) => c.warranty_status === "em_analise" && daysSince(c.created_at) > 3).length || 0;
    if (pendingWarranties > 0) list.push({ icon: ShieldCheck, label: "Garantias aguardando análise", count: pendingWarranties, color: "text-orange-500" });

    const pendingQuotes = quotes?.filter((q: any) => q.status === "aguardando_aprovacao" && daysSince(q.updated_at) > 3).length || 0;
    if (pendingQuotes > 0) list.push({ icon: FileText, label: "Orçamentos aguardando aprovação", count: pendingQuotes, color: "text-blue-500" });

    const staleOrders = orders?.filter((o: any) => ["aberta", "em_andamento"].includes(o.status) && daysSince(o.updated_at) > 7).length || 0;
    if (staleOrders > 0) list.push({ icon: ClipboardList, label: "OS abertas >7 dias", count: staleOrders, color: "text-red-500" });

    return list;
  }, [tickets, orders, claims, quotes]);

  if (!alerts.length) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="font-display font-semibold text-sm">Alertas Operacionais</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {alerts.map((alert, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
            <alert.icon className={`h-4 w-4 ${alert.color}`} />
            <div className="min-w-0">
              <span className="text-xl font-bold font-mono">{alert.count}</span>
              <p className="text-[11px] text-muted-foreground leading-tight">{alert.label}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
