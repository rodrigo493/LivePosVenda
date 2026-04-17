import { useState, useMemo } from "react";
import { Users, Plus, Search, History, Upload, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useClients, useCreateClient, useUpdateClient } from "@/hooks/useClients";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Client } from "@/types/database";
import { ClientHistoryDialog } from "@/components/import/ClientHistoryDialog";
import { BulkHistoryImportDialog } from "@/components/import/BulkHistoryImportDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WhatsAppChat } from "@/components/whatsapp/WhatsAppChat";

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
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [chatClient, setChatClient] = useState<Client | null>(null);

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
                  {["Código", "Nome", "CPF/CNPJ", "Cidade", "Estado", "Email", "Status", ""].map((h) => (
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
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setHistoryClient(client)} title="Histórico">
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => setChatClient(client)} title="WhatsApp">
                          <MessageSquare className="h-3.5 w-3.5" />
                        </Button>
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
    </div>
  );
};

export default ClientsPage;
