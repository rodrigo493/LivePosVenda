import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useEquipmentModels } from "@/hooks/useEquipments";
import { useCreateEquipmentModel } from "@/hooks/useEquipments";
import { motion } from "framer-motion";

const EquipmentPage = () => {
  const { data: models, isLoading } = useEquipmentModels();
  const createModel = useCreateEquipmentModel();
  const [dialogOpen, setDialogOpen] = useState(false);

  const fields = [
    {
      name: "name",
      label: "Nome do Aparelho",
      type: "text" as const,
      required: true,
      placeholder: "Ex: Autoclave 21L",
    },
  ];

  const handleCreate = async (values: Record<string, any>) => {
    await createModel.mutateAsync({ name: values.name });
  };

  return (
    <div>
      <PageHeader
        title="Equipamentos"
        description="Cadastro e histórico técnico dos equipamentos"
        icon={Package}
        action={<Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo Equipamento</Button>}
      />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !models?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum equipamento cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Nome do Aparelho", "Categoria", "Status"].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((m: any) => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{m.category || "—"}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{m.status || "ativo"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Novo Equipamento" fields={fields} onSubmit={handleCreate} />
    </div>
  );
};

export default EquipmentPage;
