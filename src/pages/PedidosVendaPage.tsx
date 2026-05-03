import { ShoppingCart, ArrowLeft, Package } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { serviceRequestStatusLabels as statusLabels } from "@/constants/statusLabels";
import { formatCurrency as fmtCurrency, formatDate as fmtDate } from "@/lib/formatters";

const PedidosVendaPage = () => {
  const navigate = useNavigate();

  const { data: requests, isLoading } = useQuery({
    queryKey: ["service_requests_pd"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))")
        .eq("document_type", "pd")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Pedidos de Venda (PD)"
        description="Pedidos de venda de produtos e serviços"
        icon={ShoppingCart}
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        }
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !requests?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm bg-card rounded-xl border">Nenhum pedido de venda registrado.</div>
        ) : (
          requests.map((sr: any) => (
            <div
              key={sr.id}
              className="border rounded-lg p-4 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/pedidos-venda/${sr.id}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold font-mono">{(sr as any).request_number || "PD"}</span>
                  {sr.tickets?.ticket_number && <Badge variant="outline" className="text-[10px] font-mono">{sr.tickets.ticket_number}</Badge>}
                  <StatusBadge status={statusLabels[sr.status] || sr.status} />
                </div>
                <span className="text-sm font-bold font-mono">{fmtCurrency(sr.estimated_cost || 0)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{sr.tickets?.clients?.name || "—"}</span>
                <span>Equip: {sr.tickets?.equipments?.equipment_models?.name || "—"}</span>
                <span>Criado: {fmtDate(sr.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </motion.div>
    </div>
  );
};

export default PedidosVendaPage;
