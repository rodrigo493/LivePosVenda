import { useState } from "react";
import { ClipboardList, Plus, Eye } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useWorkOrders, useCreateWorkOrder, useUpdateWorkOrder } from "@/hooks/useWorkOrders";
import { useClients, useCreateClient } from "@/hooks/useClients";
import { useEquipments, useCreateEquipment } from "@/hooks/useEquipments";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { logTechnicalEvent } from "@/hooks/useTechnicalHistory";
import { workOrderStatusLabels as statusLabels, workOrderTypeLabels as typeLabels } from "@/constants/statusLabels";

const WorkOrdersPage = () => {
  const { data: orders, isLoading } = useWorkOrders();
  const { data: clients } = useClients();
  const { data: equipments } = useEquipments();
  const createOrder = useCreateWorkOrder();
  const createClient = useCreateClient();
  const createEquipment = useCreateEquipment();
  const updateOrder = useUpdateWorkOrder();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newEquipOpen, setNewEquipOpen] = useState(false);

  const quickClientFields = [
    { name: "name", label: "Nome / Razão Social", required: true },
    { name: "phone", label: "Telefone", type: "tel" as const },
  ];

  const quickEquipFields = [
    { name: "serial_number", label: "Nº de Série", required: true },
    { name: "client_id", label: "Cliente", type: "select" as const, options: clients?.map((c) => ({ value: c.id, label: c.name })) || [] },
  ];

  const fields = [
    { name: "client_id", label: "Cliente", type: "select" as const, required: true, options: clients?.map((c) => ({ value: c.id, label: c.name })) || [], onCreateNew: () => setNewClientOpen(true) },
    { name: "equipment_id", label: "Equipamento", type: "select" as const, required: true, options: equipments?.map((e: any) => ({ value: e.id, label: `${e.equipment_models?.name || 'Equip.'} - ${e.serial_number}` })) || [], onCreateNew: () => setNewEquipOpen(true) },
    { name: "order_type", label: "Tipo de Atendimento", type: "select" as const, required: true, options: Object.entries(typeLabels).map(([v, l]) => ({ value: v, label: l })) },
    { name: "diagnosis", label: "Diagnóstico", type: "textarea" as const },
    { name: "cause", label: "Causa", type: "textarea" as const },
    { name: "solution", label: "Solução Aplicada", type: "textarea" as const },
    { name: "service_time_hours", label: "Tempo de Serviço (horas)", type: "number" as const },
  ];

  const handleCreate = async (values: Record<string, any>) => {
    const data = await createOrder.mutateAsync({ ...values, created_by: user?.id, order_number: "" } as any);
    if (values.equipment_id) {
      await logTechnicalEvent({
        equipment_id: values.equipment_id,
        event_type: "os_criada",
        description: `OS criada para ${values.order_type}`,
        reference_type: "work_order",
        reference_id: data.id,
        performed_by: user?.id,
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        description="Gestão de ordens de serviço e atendimentos técnicos"
        icon={ClipboardList}
        action={<Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> Nova OS</Button>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !orders?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma ordem de serviço registrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Nº OS", "Cliente", "Equipamento", "Tipo", "Status", "Data", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order: any) => (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono font-medium">{order.order_number}</td>
                    <td className="px-4 py-3 text-sm">{order.clients?.name}</td>
                    <td className="px-4 py-3 text-sm">{order.equipments?.equipment_models?.name} - {order.equipments?.serial_number}</td>
                    <td className="px-4 py-3 text-sm">{typeLabels[order.order_type]}</td>
                    <td className="px-4 py-3"><StatusBadge status={statusLabels[order.status] || order.status} /></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(order.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3 flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => navigate(`/ordens-servico/${order.id}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <select
                        className="text-xs border rounded px-2 py-1 bg-background"
                        value={order.status}
                        onChange={(e) => updateOrder.mutateAsync({ id: order.id, status: e.target.value } as any)}
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

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Nova Ordem de Serviço" fields={fields} onSubmit={handleCreate} />
      <CrudDialog open={newClientOpen} onOpenChange={setNewClientOpen} title="Novo Cliente (Rápido)" fields={quickClientFields} onSubmit={async (v) => { await createClient.mutateAsync({ ...v, created_by: user?.id } as any); }} />
      <CrudDialog open={newEquipOpen} onOpenChange={setNewEquipOpen} title="Novo Equipamento (Rápido)" fields={quickEquipFields} onSubmit={async (v) => { await createEquipment.mutateAsync(v as any); }} />
    </div>
  );
};

export default WorkOrdersPage;
