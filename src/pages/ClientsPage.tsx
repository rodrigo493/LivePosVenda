import { useState, useMemo } from "react";
import { Users, Plus, Search, History, Upload, MessageSquare, Ticket, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from "@/hooks/useClients";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Client } from "@/types/database";
import { ClientHistoryDialog } from "@/components/import/ClientHistoryDialog";
import { BulkHistoryImportDialog } from "@/components/import/BulkHistoryImportDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";
import { useCreateTicket } from "@/hooks/useTickets";
import { useAllUsers } from "@/hooks/useUserAccess";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PIPELINE_STAGES_FALLBACK = [
  { key: "sem_atendimento", label: "Sem atendimento" },
  { key: "primeiro_contato", label: "Primeiro contato" },
  { key: "em_analise", label: "Em análise" },
  { key: "separacao_pecas", label: "Separação de peças" },
  { key: "concluido", label: "Concluído" },
];
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const clientFields = [
  { name: "name", label: "Nome / Razão Social", required: true, placeholder: "Nome do cliente" },
  { name: "document", label: "CPF / CNPJ", placeholder: "00.000.000/0000-00" },
  { name: "document_type", label: "Tipo Documento", type: "select" as const, options: [{ value: "cpf", label: "CPF" }, { value: "cnpj", label: "CNPJ" }] },
  { name: "email", label: "Email", type: "email" as const, placeholder: "email@exemplo.com" },
  { name: "phone", label: "Telefone", type: "tel" as const, placeholder: "(11) 99999-9999" },
  { name: "whatsapp", label: "WhatsApp", type: "tel" as const, placeholder: "(11) 99999-9999" },
  { name: "contact_person", label: "Responsável", placeholder: "Nome do responsável" },
  { name: "address", label: "Endereço", placeholder: "Rua, número, bairro" },
  { name: "city", label: "Cidade", placeholder: "São Paulo" },
  { name: "state", label: "Estado", placeholder: "SP" },
  { name: "zip_code", label: "CEP", placeholder: "00000-000" },
  { name: "notes", label: "Observações", type: "textarea" as const },
];

const ClientsPage = () => {
  const { data: clients, isLoading } = useClients();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const deleteClient = useDeleteClient();
  const { data: allUsers } = useAllUsers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [chatClient, setChatClient] = useState<Client | null>(null);
  const [ticketClient, setTicketClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);
  const [ticketForm, setTicketForm] = useState({
    title: "",
    ticket_type: "chamado_tecnico",
    pipeline_stage: "sem_atendimento",
    priority: "media",
    description: "",
    assigned_to: user?.id ?? "",
  });
  const createTicket = useCreateTicket();

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return clients;
    return clients.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const doc = (c.document || "").toLowerCase();
      const email = (c.email || "").toLowerCase();
      const city = (c.city || "").toLowerCase();
      return name.includes(term) || doc.includes(term) || email.includes(term) || city.includes(term);
    });
  }, [clients, searchTerm]);

  const handleCreate = async (values: Record<string, any>) => {
    await createClient.mutateAsync({ ...values, created_by: user?.id } as any);
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
  };

  const handleUpdate = async (values: Record<string, any>) => {
    if (!editingClient) return;
    await updateClient.mutateAsync({ id: editingClient.id, ...values } as any);
    setEditingClient(null);
  };

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cadastro e gestão de clientes"
        icon={Users}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Importar Histórico
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo Cliente
            </Button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nome, documento, email ou cidade..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !filteredClients.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{searchTerm ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado. Clique em \"Novo Cliente\" para começar."}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Código", "Nome", "CPF/CNPJ", "Cidade", "Estado", "Email", "Status",
                    ...(isAdmin ? ["Responsável"] : []),
                    ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{(client as any).client_code || "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium">{client.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{client.document || "—"}</td>
                    <td className="px-4 py-3 text-sm">{client.city || "—"}</td>
                    <td className="px-4 py-3 text-sm">{client.state || "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{client.email || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={client.status} /></td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <select
                          className="text-xs border rounded px-1.5 py-1 bg-background max-w-[140px]"
                          value={(client as any).assigned_to ?? ""}
                          onChange={(e) => {
                            updateClient.mutate({
                              id: client.id,
                              assigned_to: e.target.value || null,
                            } as any);
                          }}
                        >
                          <option value="">— Ninguém —</option>
                          {(allUsers ?? []).map((u) => (
                            <option key={u.user_id} value={u.user_id}>
                              {u.full_name}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setHistoryClient(client)} title="Histórico">
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => setChatClient(client)} title="WhatsApp">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => {
                          setTicketClient(client);
                          setTicketForm({
                            title: `Atendimento — ${client.name}`,
                            ticket_type: "chamado_tecnico",
                            pipeline_stage: "sem_atendimento",
                            priority: "media",
                            description: "",
                            assigned_to: user?.id ?? "",
                          });
                        }} title="Criar card">
                          <Ticket className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); setDeletingClient(client); }}
                            title="Excluir cliente"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleEdit(client)}>Editar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Novo Cliente" fields={clientFields} onSubmit={handleCreate} />
      <CrudDialog
        open={!!editingClient}
        onOpenChange={(open) => !open && setEditingClient(null)}
        title="Editar Cliente"
        fields={clientFields}
        initialValues={editingClient || {}}
        onSubmit={handleUpdate}
      />

      <ClientHistoryDialog
        client={historyClient}
        open={!!historyClient}
        onOpenChange={(open) => !open && setHistoryClient(null)}
      />

      <BulkHistoryImportDialog
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
      />

      {/* ── Create Ticket Dialog ── */}
      <Dialog open={!!ticketClient} onOpenChange={(open) => !open && setTicketClient(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-blue-600" />
              Criar card — {ticketClient?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={ticketForm.title} onChange={(e) => setTicketForm((f) => ({ ...f, title: e.target.value }))} placeholder="Título do atendimento" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={ticketForm.ticket_type} onValueChange={(v) => setTicketForm((f) => ({ ...f, ticket_type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chamado_tecnico">Chamado Técnico</SelectItem>
                    <SelectItem value="garantia">Garantia</SelectItem>
                    <SelectItem value="assistencia">Assistência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridade</Label>
                <Select value={ticketForm.priority} onValueChange={(v) => setTicketForm((f) => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Etapa no funil</Label>
              <Select value={ticketForm.pipeline_stage} onValueChange={(v) => setTicketForm((f) => ({ ...f, pipeline_stage: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES_FALLBACK.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsável</Label>
              <Select
                value={ticketForm.assigned_to}
                onValueChange={(v) => setTicketForm((f) => ({ ...f, assigned_to: v }))}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {(allUsers ?? []).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea value={ticketForm.description} onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))} placeholder="Descreva o atendimento..." rows={3} className="text-sm resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTicketClient(null)}>Cancelar</Button>
            <Button size="sm" disabled={!ticketForm.title.trim() || createTicket.isPending} onClick={async () => {
              if (!ticketClient) return;
              try {
                await createTicket.mutateAsync({
                  client_id: ticketClient.id,
                  title: ticketForm.title,
                  ticket_type: ticketForm.ticket_type as any,
                  pipeline_stage: ticketForm.pipeline_stage as any,
                  priority: ticketForm.priority as any,
                  description: ticketForm.description || null,
                  status: "aberto",
                  ticket_number: "",
                  created_by: user?.id,
                  assigned_to: ticketForm.assigned_to || user?.id,
                } as any);
                toast.success(`Card criado para ${ticketClient.name}`);
                setTicketClient(null);
              } catch (err: any) {
                toast.error(err?.message || "Erro ao criar card");
              }
            }}>
              {createTicket.isPending ? "Criando..." : "Criar card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!chatClient} onOpenChange={(open) => !open && setChatClient(null)}>
        <DialogContent className="max-w-2xl h-[600px] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="h-4 w-4 text-emerald-600" />
              WhatsApp — {chatClient?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-4">
            {chatClient && (
              <WhatsAppChat
                clientId={chatClient.id}
                clientPhone={(chatClient as any).whatsapp || chatClient.phone || ""}
                clientName={chatClient.name}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: confirmar exclusão de cliente ── */}
      <AlertDialog open={!!deletingClient} onOpenChange={(open) => !open && setDeletingClient(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingClient?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deletingClient) return;
                try {
                  await deleteClient.mutateAsync(deletingClient.id);
                  toast.success(`Cliente ${deletingClient.name} excluído.`);
                  setDeletingClient(null);
                } catch (err: any) {
                  const msg = err?.message ?? "";
                  if (msg.startsWith("ACTIVE_TICKETS:")) {
                    const count = msg.split(":")[1];
                    toast.error(`Cliente possui ${count} card(s) ativo(s). Encerre-os antes de excluir.`);
                  } else {
                    toast.error("Erro ao excluir cliente.");
                  }
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClientsPage;
