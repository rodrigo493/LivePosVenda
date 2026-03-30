import { useState } from "react";
import { HardHat, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useTechnicians, useCreateTechnician, useUpdateTechnician, Technician, TechnicianInsert } from "@/hooks/useTechnicians";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";

const techFields = [
  { name: "name", label: "Nome Completo", required: true, placeholder: "Nome do técnico" },
  { name: "email", label: "E-mail", type: "email" as const, placeholder: "email@exemplo.com" },
  { name: "phone", label: "Telefone", type: "tel" as const, placeholder: "(00) 0000-0000" },
  { name: "whatsapp", label: "WhatsApp", type: "tel" as const, placeholder: "(00) 00000-0000" },
  { name: "specialty", label: "Especialidade", placeholder: "Elétrica, Mecânica, Hidráulica..." },
  { name: "address", label: "Endereço", placeholder: "Rua, número, bairro..." },
  { name: "city", label: "Cidade", placeholder: "Cidade" },
  { name: "state", label: "Estado", placeholder: "UF" },
  { name: "zip_code", label: "CEP", placeholder: "00000-000" },
  { name: "notes", label: "Observações", type: "textarea" as const },
];

const TechniciansPage = () => {
  const { data: technicians, isLoading } = useTechnicians();
  const createTechnician = useCreateTechnician();
  const updateTechnician = useUpdateTechnician();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Technician | null>(null);
  const [search, setSearch] = useState("");

  const filtered = technicians?.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.email?.toLowerCase().includes(q) ||
      t.phone?.toLowerCase().includes(q) ||
      t.specialty?.toLowerCase().includes(q) ||
      t.city?.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (values: Record<string, any>) => {
    await createTechnician.mutateAsync(values as TechnicianInsert);
  };

  const handleUpdate = async (values: Record<string, any>) => {
    if (!editing) return;
    await updateTechnician.mutateAsync({ id: editing.id, ...values } as any);
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title="Técnicos"
        description="Cadastro e gestão de técnicos de campo"
        icon={HardHat}
        action={
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo Técnico
          </Button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, especialidade, cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-card overflow-hidden"
      >
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !filtered?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Nenhum técnico encontrado.{" "}
            <button className="text-primary underline" onClick={() => setDialogOpen(true)}>
              Cadastrar primeiro técnico
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Nome", "Especialidade", "Telefone", "WhatsApp", "E-mail", "Cidade/UF", "Status", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tech) => (
                  <tr key={tech.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{tech.name}</td>
                    <td className="px-4 py-3 text-sm">{tech.specialty || "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{tech.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">{tech.whatsapp || "—"}</td>
                    <td className="px-4 py-3 text-sm">{tech.email || "—"}</td>
                    <td className="px-4 py-3 text-sm">
                      {tech.city && tech.state ? `${tech.city}/${tech.state}` : tech.city || tech.state || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={tech.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setEditing(tech)}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Novo Técnico"
        fields={techFields}
        onSubmit={handleCreate}
      />
      <CrudDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Editar Técnico"
        fields={techFields}
        initialValues={editing || {}}
        onSubmit={handleUpdate}
      />
    </div>
  );
};

export default TechniciansPage;
