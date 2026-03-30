import { useState } from "react";
import { ShieldCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useWarrantyClaims, useCreateWarrantyClaim, useUpdateWarrantyClaim } from "@/hooks/useWarrantyAndService";
import { useTickets } from "@/hooks/useTickets";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { warrantyStatusLabels } from "@/constants/statusLabels";

const WarrantiesPage = () => {
  const { data: claims, isLoading } = useWarrantyClaims();
  const { data: tickets } = useTickets("garantia");
  const createClaim = useCreateWarrantyClaim();
  const updateClaim = useUpdateWarrantyClaim();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  const fields = [
    { name: "ticket_id", label: "Ticket de Garantia", type: "select" as const, required: true, options: tickets?.map((t: any) => ({ value: t.id, label: `${t.ticket_number} - ${t.title}` })) || [], onCreateNew: () => setNewTicketOpen(true) },
    { name: "purchase_date", label: "Data da Compra", type: "date" as const },
    { name: "installation_date", label: "Data da Instalação", type: "date" as const },
    { name: "warranty_period_months", label: "Prazo de Garantia (meses)", type: "number" as const },
    { name: "defect_description", label: "Descrição do Defeito", type: "textarea" as const, required: true },
    { name: "technical_analysis", label: "Análise Técnica", type: "textarea" as const },
    { name: "covered_parts", label: "Peças Cobertas", placeholder: "Lista de peças cobertas pela garantia" },
    { name: "internal_cost", label: "Custo Interno (R$)", type: "number" as const },
  ];

  const handleCreate = async (values: Record<string, any>) => {
    await createClaim.mutateAsync(values as any);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await updateClaim.mutateAsync({ id, warranty_status: newStatus } as any);
  };

  return (
    <div>
      <PageHeader
        title="Garantias"
        description="Tickets de garantia e análise de procedência"
        icon={ShieldCheck}
        action={<Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> Nova Garantia</Button>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !claims?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma garantia registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Ticket", "Cliente", "Equipamento", "Defeito", "Status", "Custo Interno", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claims.map((claim: any) => (
                  <tr key={claim.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{claim.tickets?.ticket_number}</td>
                    <td className="px-4 py-3 text-sm">{claim.tickets?.clients?.name}</td>
                    <td className="px-4 py-3 text-sm">{claim.tickets?.equipments?.equipment_models?.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{claim.defect_description}</td>
                    <td className="px-4 py-3"><StatusBadge status={warrantyStatusLabels[claim.warranty_status] || claim.warranty_status} /></td>
                    <td className="px-4 py-3 text-sm font-mono">R$ {Number(claim.internal_cost || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <select
                        className="text-xs border rounded px-2 py-1 bg-background"
                        value={claim.warranty_status}
                        onChange={(e) => handleStatusChange(claim.id, e.target.value)}
                      >
                        {Object.entries(warrantyStatusLabels).map(([val, label]) => (
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

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Nova Solicitação de Garantia" fields={fields} onSubmit={handleCreate} />
    </div>
  );
};

export default WarrantiesPage;
