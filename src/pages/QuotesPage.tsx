import { useState } from "react";
import { FileText, Plus, Eye, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useQuotes, useCreateQuote, useUpdateQuote } from "@/hooks/useQuotes";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { useEquipments, useCreateEquipment } from "@/hooks/useEquipments";
import { useTickets } from "@/hooks/useTickets";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { quoteStatusLabels as statusLabels } from "@/constants/statusLabels";

const QuotesPage = () => {
  const { data: quotes, isLoading } = useQuotes();
  const { data: clients } = useClients();
  const { data: equipments } = useEquipments();
  const { data: tickets } = useTickets();
  const createQuote = useCreateQuote();
  const createClient = useCreateClient();
  const createEquipment = useCreateEquipment();
  const updateQuote = useUpdateQuote();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newEquipOpen, setNewEquipOpen] = useState(false);

  const quickClientFields = [
    { name: "name", label: "Nome / Razão Social", required: true },
    { name: "phone", label: "Telefone", type: "tel" as const },
    { name: "email", label: "Email", type: "email" as const },
  ];

  const quickEquipFields = [
    { name: "serial_number", label: "Nº de Série", required: true },
    { name: "client_id", label: "Cliente", type: "select" as const, options: clients?.map((c) => ({ value: c.id, label: c.name })) || [] },
  ];

  const fields = [
    { name: "client_id", label: "Cliente", type: "select" as const, required: true, options: clients?.map((c) => ({ value: c.id, label: c.name })) || [], onCreateNew: () => setNewClientOpen(true) },
    { name: "equipment_id", label: "Equipamento", type: "select" as const, options: equipments?.map((e: any) => ({ value: e.id, label: `${e.equipment_models?.name || "Equip."} - ${e.serial_number}` })) || [], onCreateNew: () => setNewEquipOpen(true) },
    { name: "ticket_id", label: "Ticket de Origem", type: "select" as const, options: tickets?.map((t: any) => ({ value: t.id, label: `${t.ticket_number} - ${t.title}` })) || [] },
    { name: "notes", label: "Observações", type: "textarea" as const },
    { name: "valid_until", label: "Válido até", type: "date" as const },
  ];

  const handleCreate = async (values: Record<string, any>) => {
    await createQuote.mutateAsync({ ...values, created_by: user?.id, quote_number: "" });
  };

  return (
    <div>
      <PageHeader
        title="Orçamentos"
        description="Gestão de orçamentos e propostas comerciais"
        icon={FileText}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo Orçamento
            </Button>
          </div>
        }
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !quotes?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum orçamento registrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Nº", "Cliente", "Equipamento", "Ticket", "Status", "Total", "Data", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quotes.map((q: any) => (
                  <tr key={q.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/orcamentos/${q.id}`)}>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-primary">{q.quote_number}</td>
                    <td className="px-4 py-3 text-sm">{q.clients?.name}</td>
                    <td className="px-4 py-3 text-sm">{q.equipments?.equipment_models?.name ? `${q.equipments.equipment_models.name} - ${q.equipments.serial_number}` : "-"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{q.tickets?.ticket_number || "-"}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusLabels[q.status] || q.status} /></td>
                    <td className="px-4 py-3 text-sm font-mono">R$ {(Number(q.total) > 0 ? Number(q.total) : (q.quote_items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity) * Number(it.unit_price)), 0)).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(q.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <select
                        className="text-xs border rounded px-2 py-1 bg-background"
                        value={q.status}
                        onChange={(e) => updateQuote.mutateAsync({ id: q.id, status: e.target.value })}
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

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Novo Orçamento" fields={fields} onSubmit={handleCreate} />
      <CrudDialog open={newClientOpen} onOpenChange={setNewClientOpen} title="Novo Cliente (Rápido)" fields={quickClientFields} onSubmit={async (v) => { await createClient.mutateAsync({ ...v, created_by: user?.id } as any); }} />
      <CrudDialog open={newEquipOpen} onOpenChange={setNewEquipOpen} title="Novo Equipamento (Rápido)" fields={quickEquipFields} onSubmit={async (v) => { await createEquipment.mutateAsync(v as any); }} />
    </div>
  );
};

export default QuotesPage;
