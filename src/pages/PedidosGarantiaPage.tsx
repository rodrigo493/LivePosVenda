import { ShieldCheck, ArrowLeft, Shield } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { warrantyStatusLabels } from "@/constants/statusLabels";
import { formatCurrency as fmtCurrency, formatDate as fmtDate } from "@/lib/formatters";

const PedidosGarantiaPage = () => {
  const navigate = useNavigate();

  const { data: claims, isLoading } = useQuery({
    queryKey: ["warranty_claims_pg"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranty_claims")
        .select("*, tickets(ticket_number, title, clients(name), equipments(serial_number, equipment_models(name)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Pedidos de Garantia (PG)"
        description="Solicitações de garantia e análise de procedência"
        icon={ShieldCheck}
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar
          </Button>
        }
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !claims?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm bg-card rounded-xl border">Nenhum pedido de garantia registrado.</div>
        ) : (
          claims.map((claim: any) => (
            <div
              key={claim.id}
              className="border rounded-lg p-4 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/pedidos-garantia/${claim.id}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold font-mono">{claim.claim_number || "PG"}</span>
                  {claim.tickets?.ticket_number && <Badge variant="outline" className="text-[10px] font-mono">{claim.tickets.ticket_number}</Badge>}
                  <StatusBadge status={warrantyStatusLabels[claim.warranty_status] || claim.warranty_status} />
                </div>
                <span className="text-sm font-bold font-mono">{fmtCurrency(claim.internal_cost || 0)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{claim.tickets?.clients?.name || "—"}</span>
                <span>Equip: {claim.tickets?.equipments?.equipment_models?.name || "—"}</span>
                <span>Criado: {fmtDate(claim.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </motion.div>
    </div>
  );
};

export default PedidosGarantiaPage;
