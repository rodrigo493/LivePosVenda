import { useState } from "react";
import { Wrench, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useServiceRequests, useCreateServiceRequest, useUpdateServiceRequest } from "@/hooks/useWarrantyAndService";
import { useTickets } from "@/hooks/useTickets";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { requestTypeLabels, serviceRequestStatusLabels as statusLabels } from "@/constants/statusLabels";

const ServiceRequestsPage = () => {
  const { data: requests, isLoading } = useServiceRequests();
  const { data: tickets } = useTickets("assistencia");
  const createRequest = useCreateServiceRequest();
  const updateRequest = useUpdateServiceRequest();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const fields = [
    { name: "ticket_id", label: "Ticket de Assistência", type: "select" as const, required: true, options: tickets?.map((t: any) => ({ value: t.id, label: `${t.ticket_number} - ${t.title}` })) || [], onCreateNew: () => setNewTicketOpen(true) },
    { name: "request_type", label: "Tipo", type: "select" as const, required: true, options: Object.entries(requestTypeLabels).map(([v, l]) => ({ value: v, label: l })) },
    { name: "estimated_cost", label: "Custo Estimado (R$)", type: "number" as const },
    { name: "notes", label: "Observações", type: "textarea" as const },
  ];

  return (
    <div>
      <PageHeader
        title="Pedidos de Assistência"
        description="Solicitações de manutenção, inspeção e suporte técnico"
        icon={Wrench}
        action={<Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo Pedido</Button>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !requests?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum pedido de assistência registrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Ticket", "Cliente", "Tipo", "Custo Est.", "Status", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((req: any) => (
                  <tr key={req.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{req.tickets?.ticket_number}</td>
                    <td className="px-4 py-3 text-sm">{req.tickets?.clients?.name}</td>
                    <td className="px-4 py-3 text-sm">{requestTypeLabels[req.request_type]}</td>
                    <td className="px-4 py-3 text-sm font-mono">R$ {Number(req.estimated_cost || 0).toFixed(2)}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusLabels[req.status] || req.status} /></td>
                    <td className="px-4 py-3">
                      <select
                        className="text-xs border rounded px-2 py-1 bg-background"
                        value={req.status}
                        onChange={(e) => updateRequest.mutateAsync({ id: req.id, status: e.target.value } as any)}
                      >
                        {Object.entries(statusLabels).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Novo Pedido de Assistência" fields={fields} onSubmit={async (v) => { await createRequest.mutateAsync(v as any); }} />
    </div>
  );
};

export default ServiceRequestsPage;
