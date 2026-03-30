import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useClientHistory, useCreateClientHistory, useUpdateClientHistory } from "@/hooks/useClientHistory";
import { Client } from "@/types/database";
import { format } from "date-fns";
import { FileSpreadsheet, Plus, ArrowLeft, Pencil } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ClientHistoryImportDialog } from "@/components/import/ClientHistoryImportDialog";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useAuth } from "@/hooks/useAuth";
import type { ClientServiceHistory } from "@/hooks/useClientHistory";

const historyFields = [
  { name: "service_date", label: "Data do Atendimento", type: "date" as const, required: true },
  { name: "device", label: "Aparelho", placeholder: "Ex: Purificador PA735" },
  { name: "problem_reported", label: "Problema Relatado", type: "textarea" as const },
  { name: "solution_provided", label: "Solução Apresentada", type: "textarea" as const },
  { name: "history_notes", label: "Histórico", type: "textarea" as const },
  { name: "parts_sent", label: "Peças Enviadas", type: "textarea" as const, placeholder: "Ex: Filtro, Membrana..." },
  { name: "invoice_number", label: "Número da Nota Fiscal", placeholder: "Ex: NF-00123" },
  { name: "pg_number", label: "Número do PG", placeholder: "Ex: PG.26.128" },
  { name: "pa_number", label: "Número do PA", placeholder: "Ex: PA.26.537" },
  {
    name: "service_status", label: "Status", type: "select" as const, options: [
      { value: "concluido", label: "Concluído" },
      { value: "pendente", label: "Pendente" },
      { value: "em_andamento", label: "Em Andamento" },
      { value: "cancelado", label: "Cancelado" },
    ]
  },
];

interface Props {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientHistoryDialog({ client, open, onOpenChange }: Props) {
  const { data: history, isLoading } = useClientHistory(client?.id);
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ClientServiceHistory | null>(null);
  const createHistory = useCreateClientHistory();
  const updateHistory = useUpdateClientHistory();
  const { user } = useAuth();

  const handleAdd = async (values: Record<string, any>) => {
    if (!client) return;
    await createHistory.mutateAsync([{
      client_id: client.id,
      service_date: values.service_date ? new Date(values.service_date).toISOString() : new Date().toISOString(),
      device: values.device || null,
      problem_reported: values.problem_reported || null,
      solution_provided: values.solution_provided || null,
      history_notes: values.history_notes || null,
      parts_sent: values.parts_sent || null,
      invoice_number: values.invoice_number || null,
      pg_number: values.pg_number || null,
      pa_number: values.pa_number || null,
      service_status: values.service_status || "concluido",
      created_by: user?.id || null,
    }] as any);
  };

  const handleEdit = async (values: Record<string, any>) => {
    if (!editRecord) return;
    await updateHistory.mutateAsync({
      id: editRecord.id,
      service_date: values.service_date ? new Date(values.service_date).toISOString() : undefined,
      device: values.device || null,
      problem_reported: values.problem_reported || null,
      solution_provided: values.solution_provided || null,
      history_notes: values.history_notes || null,
      parts_sent: values.parts_sent || null,
      invoice_number: values.invoice_number || null,
      pg_number: values.pg_number || null,
      pa_number: values.pa_number || null,
      service_status: values.service_status || "concluido",
    } as any);
  };

  const openEdit = (row: ClientServiceHistory) => {
    setEditRecord(row);
  };

  if (!open || !client) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Histórico — {client.name}</h1>
              <p className="text-sm text-muted-foreground">Registros de atendimento do cliente</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Importar Excel
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo Registro
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : !history?.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum histórico registrado. Clique em "Novo Registro" ou "Importar Excel" para começar.
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((row) => (
                <div key={row.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {row.service_date ? format(new Date(row.service_date), "dd/MM/yyyy HH:mm") : "—"}
                      </span>
                      <StatusBadge status={row.service_status} />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(row)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {row.device && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Aparelho</p>
                      <p className="text-sm">{row.device}</p>
                    </div>
                  )}

                  {row.problem_reported && (
                    <div className="border-l-2 border-destructive pl-3">
                      <p className="text-[10px] uppercase tracking-wider text-destructive font-medium mb-0.5">Problema Relatado</p>
                      <p className="text-sm whitespace-pre-wrap">{row.problem_reported}</p>
                    </div>
                  )}

                  {row.solution_provided && (
                    <div className="border-l-2 border-emerald-500 pl-3">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium mb-0.5">Solução Apresentada</p>
                      <p className="text-sm whitespace-pre-wrap">{row.solution_provided}</p>
                    </div>
                  )}

                  {(row as any).history_notes && (
                    <div className="border-l-2 border-blue-400 pl-3">
                      <p className="text-[10px] uppercase tracking-wider text-blue-500 font-medium mb-0.5">Histórico</p>
                      <p className="text-sm whitespace-pre-wrap">{(row as any).history_notes}</p>
                    </div>
                  )}

                  {((row as any).parts_sent || (row as any).invoice_number || (row as any).pg_number || (row as any).pa_number) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-dashed">
                      {(row as any).parts_sent && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Peças Enviadas</p>
                          <p className="text-sm whitespace-pre-wrap">{(row as any).parts_sent}</p>
                        </div>
                      )}
                      {(row as any).invoice_number && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Nº Nota Fiscal</p>
                          <p className="text-sm font-mono">{(row as any).invoice_number}</p>
                        </div>
                      )}
                      {(row as any).pg_number && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Nº PG</p>
                          <p className="text-sm font-mono">{(row as any).pg_number}</p>
                        </div>
                      )}
                      {(row as any).pa_number && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">Nº PA</p>
                          <p className="text-sm font-mono">{(row as any).pa_number}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ClientHistoryImportDialog
        clientId={client.id}
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <CrudDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Novo Registro de Histórico"
        fields={historyFields}
        onSubmit={handleAdd}
      />

      <CrudDialog
        open={!!editRecord}
        onOpenChange={(o) => { if (!o) setEditRecord(null); }}
        title="Editar Registro de Histórico"
        fields={historyFields}
        initialValues={editRecord ? {
          service_date: editRecord.service_date ? new Date(editRecord.service_date).toISOString().slice(0, 10) : "",
          device: editRecord.device || "",
          problem_reported: editRecord.problem_reported || "",
          solution_provided: editRecord.solution_provided || "",
          history_notes: (editRecord as any).history_notes || "",
          parts_sent: (editRecord as any).parts_sent || "",
          invoice_number: (editRecord as any).invoice_number || "",
          pg_number: (editRecord as any).pg_number || "",
          pa_number: (editRecord as any).pa_number || "",
          service_status: editRecord.service_status || "concluido",
        } : undefined}
        onSubmit={handleEdit}
      />
    </>
  );
}
