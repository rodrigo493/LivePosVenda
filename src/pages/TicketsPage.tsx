import { useState } from "react";
import { HeadphonesIcon, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useTickets, useCreateTicket, useUpdateTicket } from "@/hooks/useTickets";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { useEquipments, useCreateEquipment } from "@/hooks/useEquipments";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AiTriageBlock } from "@/components/tickets/AiTriageBlock";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { logTechnicalEvent } from "@/hooks/useTechnicalHistory";
import { ticketStatusLabels as statusLabels, ticketTypeLabels as typeLabels } from "@/constants/statusLabels";

const TicketsPage = () => {
  const { data: tickets, isLoading } = useTickets();
  const { data: clients } = useClients();
  const { data: equipments } = useEquipments();
  const createTicket = useCreateTicket();
  const createClient = useCreateClient();
  const createEquipment = useCreateEquipment();
  const updateTicket = useUpdateTicket();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newEquipOpen, setNewEquipOpen] = useState(false);

  const clientFields = [
    { name: "name", label: "Nome / Razão Social", required: true, placeholder: "Nome do cliente" },
    { name: "phone", label: "Telefone", type: "tel" as const, placeholder: "(11) 99999-9999" },
    { name: "email", label: "Email", type: "email" as const },
  ];

  const equipFields = [
    { name: "serial_number", label: "Nº de Série", required: true, placeholder: "RF-2024-00001" },
    { name: "client_id", label: "Cliente", type: "select" as const, options: clients?.map((c) => ({ value: c.id, label: c.name })) || [] },
  ];

  const fields = [
    { name: "ticket_type", label: "Tipo", type: "select" as const, required: true, options: [
      { value: "chamado_tecnico", label: "Chamado Técnico" },
      { value: "garantia", label: "Garantia" },
      { value: "assistencia", label: "Assistência" },
    ]},
    { name: "client_id", label: "Cliente", type: "select" as const, required: true, options: clients?.map((c) => ({ value: c.id, label: c.name })) || [], onCreateNew: () => setNewClientOpen(true) },
    { name: "equipment_id", label: "Equipamento", type: "select" as const, required: true, options: equipments?.map((e: any) => ({ value: e.id, label: `${e.equipment_models?.name || 'Equip.'} - ${e.serial_number}` })) || [], onCreateNew: () => setNewEquipOpen(true) },
    { name: "title", label: "Título", required: true, placeholder: "Descrição breve do problema" },
    { name: "description", label: "Descrição Detalhada", type: "textarea" as const },
    { name: "problem_category", label: "Categoria do Problema", placeholder: "Ex: Desgaste de mola" },
    { name: "priority", label: "Prioridade", type: "select" as const, options: [
      { value: "baixa", label: "Baixa" }, { value: "media", label: "Média" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" },
    ]},
  ];

  const handleCreate = async (values: Record<string, any>) => {
    const data = await createTicket.mutateAsync({ ...values, created_by: user?.id, ticket_number: "" } as any);
    if (values.equipment_id) {
      const eventType = values.ticket_type === "garantia" ? "garantia_aberta" : values.ticket_type === "assistencia" ? "assistencia_aberta" : "chamado_aberto";
      await logTechnicalEvent({
        equipment_id: values.equipment_id,
        event_type: eventType,
        description: `${values.title}`,
        reference_type: "ticket",
        reference_id: data.id,
        performed_by: user?.id,
      });
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    await updateTicket.mutateAsync({ id, status: newStatus } as any);
  };

  return (
    <div>
      <PageHeader
        title="Chamados"
        description="Gestão de chamados técnicos, garantias e assistências"
        icon={HeadphonesIcon}
        action={<Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo Chamado</Button>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !tickets?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum chamado registrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
               <tr className="border-b bg-muted/50">
                  {["Nº", "Tipo", "Cliente", "Equipamento", "Origem", "Prioridade", "Status", "Data", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket: any) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    statusLabels={statusLabels}
                    typeLabels={typeLabels}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Novo Chamado" fields={fields} onSubmit={handleCreate} />
      <CrudDialog open={newClientOpen} onOpenChange={setNewClientOpen} title="Novo Cliente (Rápido)" fields={clientFields} onSubmit={async (v) => { await createClient.mutateAsync({ ...v, created_by: user?.id } as any); }} />
      <CrudDialog open={newEquipOpen} onOpenChange={setNewEquipOpen} title="Novo Equipamento (Rápido)" fields={equipFields} onSubmit={async (v) => { await createEquipment.mutateAsync(v as any); }} />
    </div>
  );
};

function TicketRow({ ticket, statusLabels, typeLabels, onStatusChange }: {
  ticket: any;
  statusLabels: Record<string, string>;
  typeLabels: Record<string, string>;
  onStatusChange: (id: string, status: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasTriage = !!ticket.ai_triage;

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3 text-sm font-mono font-medium">{ticket.ticket_number}</td>
        <td className="px-4 py-3 text-sm">{typeLabels[ticket.ticket_type] || ticket.ticket_type}</td>
        <td className="px-4 py-3 text-sm">{ticket.clients?.name}</td>
        <td className="px-4 py-3 text-sm">{ticket.equipments?.equipment_models?.name} - {ticket.equipments?.serial_number}</td>
        <td className="px-4 py-3">
          {ticket.origin ? (
            <Badge variant="outline" className="text-[10px]">{ticket.origin}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-4 py-3"><StatusBadge status={ticket.priority} /></td>
        <td className="px-4 py-3"><StatusBadge status={statusLabels[ticket.status] || ticket.status} /></td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(ticket.created_at).toLocaleDateString("pt-BR")}</td>
        <td className="px-4 py-3 flex items-center gap-1">
          <select
            className="text-xs border rounded px-2 py-1 bg-background"
            value={ticket.status}
            onChange={(e) => onStatusChange(ticket.id, e.target.value)}
          >
            {Object.entries(statusLabels).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          {hasTriage && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
        </td>
      </tr>
      {expanded && hasTriage && (
        <tr>
          <td colSpan={9} className="px-4 py-3 bg-muted/20">
            <AiTriageBlock triage={ticket.ai_triage} origin={ticket.origin} channel={ticket.channel} />
          </td>
        </tr>
      )}
    </>
  );
}

export default TicketsPage;
