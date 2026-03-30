import { PORTAL_LIST_LIMIT, PORTAL_WARRANTY_LIMIT } from "@/constants/limits";
import { UserCircle, Package, ShieldCheck, HeadphonesIcon, Wrench } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { portalTicketStatusMap as statusMap, portalWarrantyStatusMap as warrantyStatusMap } from "@/constants/statusLabels";

function useMyEquipments() {
  return useQuery({
    queryKey: ["portal_equipments"],
    queryFn: async () => {
      // RLS will automatically filter - clients see only their own, staff sees all
      const { data, error } = await supabase
        .from("equipments")
        .select("*, equipment_models(name), clients(name)")
        .order("created_at", { ascending: false })
        .limit(PORTAL_LIST_LIMIT);
      if (error) throw error;
      return data || [];
    },
  });
}

function useMyTickets() {
  return useQuery({
    queryKey: ["portal_tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("*, clients(name), equipments(serial_number, equipment_models(name))")
        .order("created_at", { ascending: false })
        .limit(PORTAL_LIST_LIMIT);
      if (error) throw error;
      return data || [];
    },
  });
}

function useMyWarranties() {
  return useQuery({
    queryKey: ["portal_warranties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warranty_claims")
        .select("*, tickets(ticket_number, title, clients(name))")
        .order("created_at", { ascending: false })
        .limit(PORTAL_WARRANTY_LIMIT);
      if (error) throw error;
      return data || [];
    },
  });
}

const PortalPage = () => {
  const { data: equipments } = useMyEquipments();
  const { data: tickets } = useMyTickets();
  const { data: warranties } = useMyWarranties();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Portal do Cliente" description="Seus equipamentos, chamados e garantias" icon={UserCircle} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" onClick={() => navigate("/chamados")}>
          <HeadphonesIcon className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">Abrir Chamado</span>
        </Button>
        <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" onClick={() => navigate("/assistencia")}>
          <Wrench className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">Solicitar Assistência</span>
        </Button>
        <Button variant="outline" className="h-auto p-4 flex flex-col items-center gap-2" onClick={() => navigate("/garantias")}>
          <ShieldCheck className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium">Análise de Garantia</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" /> Meus Equipamentos
          </h3>
          {!equipments?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum equipamento encontrado.</p>
          ) : (
            <div className="space-y-3">
              {equipments.map((eq: any) => (
                <div key={eq.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{eq.equipment_models?.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{eq.serial_number} · {eq.clients?.name || "—"}</p>
                  </div>
                  <StatusBadge status={eq.warranty_status === "em_garantia" ? "Em garantia" : "Vencida"} />
                </div>
              ))}
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl border shadow-card p-6">
          <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <HeadphonesIcon className="h-4 w-4 text-primary" /> Últimos Chamados
          </h3>
          {!tickets?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum chamado encontrado.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket: any) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{ticket.ticket_number} — {ticket.title}</p>
                    <p className="text-xs text-muted-foreground">{ticket.clients?.name} · {new Date(ticket.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <StatusBadge status={statusMap[ticket.status] || ticket.status} />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Warranties section */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl border shadow-card p-6">
        <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" /> Minhas Garantias
        </h3>
        {!warranties?.length ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma garantia encontrada.</p>
        ) : (
          <div className="space-y-3">
            {warranties.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{w.tickets?.ticket_number} — {w.tickets?.title || w.defect_description}</p>
                  <p className="text-xs text-muted-foreground">{w.tickets?.clients?.name} · {new Date(w.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <StatusBadge status={warrantyStatusMap[w.warranty_status] || w.warranty_status} />
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default PortalPage;
