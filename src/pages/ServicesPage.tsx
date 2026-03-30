import { useState } from "react";
import { Wrench, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useProducts, useCreateProduct, useUpdateProduct } from "@/hooks/useProducts";
import { useTechnicians, useCreateTechnician, TechnicianInsert } from "@/hooks/useTechnicians";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { motion } from "framer-motion";
import { Product } from "@/types/database";

const techQuickFields = [
  { name: "name", label: "Nome Completo", required: true, placeholder: "Nome do técnico" },
  { name: "phone", label: "Telefone", type: "tel" as const, placeholder: "(00) 0000-0000" },
  { name: "whatsapp", label: "WhatsApp", type: "tel" as const, placeholder: "(00) 00000-0000" },
  { name: "email", label: "E-mail", type: "email" as const, placeholder: "email@exemplo.com" },
  { name: "specialty", label: "Especialidade", placeholder: "Elétrica, Mecânica..." },
];

const ServicesPage = () => {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { data: technicians } = useTechnicians();
  const createTechnician = useCreateTechnician();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [techDialogOpen, setTechDialogOpen] = useState(false);

  // Filter only services
  const services = products?.filter(
    (p) => p.product_type === "servico" || p.category === "servico"
  );

  const generateNextCode = () => {
    const existing = services?.map(s => {
      const match = s.code.match(/^SRV-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    }) || [];
    const max = existing.length ? Math.max(...existing) : 0;
    return `SRV-${String(max + 1).padStart(3, "0")}`;
  };

  const techOptions = technicians?.filter(t => t.status === "ativo").map(t => ({
    value: t.id,
    label: `${t.name}${t.specialty ? ` (${t.specialty})` : ""}`,
  })) || [];

  const serviceFields = [
    { name: "code", label: "Código", required: true, placeholder: "SRV-001" },
    { name: "name", label: "Nome do Serviço", required: true, placeholder: "Mão de obra técnica, Visita técnica..." },
    { name: "description", label: "Descrição", type: "textarea" as const, placeholder: "Detalhes do serviço..." },
    { name: "category", label: "Categoria", placeholder: "Instalação, Manutenção, Visita..." },
    {
      name: "technician_id",
      label: "Técnico Responsável",
      type: "select" as const,
      options: techOptions,
      onCreateNew: () => setTechDialogOpen(true),
    },
    { name: "base_cost", label: "Custo Base (R$)", type: "number" as const, required: true },
    { name: "margin_percent", label: "Margem (%)", type: "number" as const },
    { name: "ipi_percent", label: "IPI (%)", type: "number" as const },
    { name: "icms_percent", label: "ICMS (%)", type: "number" as const },
    { name: "pis_percent", label: "PIS (%)", type: "number" as const },
    { name: "cofins_percent", label: "COFINS (%)", type: "number" as const },
    { name: "csll_percent", label: "CSLL (%)", type: "number" as const },
    { name: "irpj_percent", label: "IRPJ (%)", type: "number" as const },
    { name: "supplier", label: "Fornecedor", placeholder: "Nome do fornecedor" },
    { name: "technical_notes", label: "Observações", type: "textarea" as const },
  ];

  const filtered = services?.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    );
  });

  const handleCreate = async (values: Record<string, any>) => {
    await createProduct.mutateAsync({
      ...values,
      product_type: "servico",
      category: values.category || "servico",
    } as any);
  };

  const handleUpdate = async (values: Record<string, any>) => {
    if (!editingService) return;
    await updateProduct.mutateAsync({ id: editingService.id, ...values } as any);
    setEditingService(null);
  };

  const handleCreateTechnician = async (values: Record<string, any>) => {
    await createTechnician.mutateAsync(values as TechnicianInsert);
  };

  const getTechName = (techId: string | null) => {
    if (!techId) return "—";
    const tech = technicians?.find(t => t.id === techId);
    return tech?.name || "—";
  };

  const calcTaxCost = (p: Product) => {
    const tax =
      (Number(p.ipi_percent || 0) +
        Number(p.icms_percent || 0) +
        Number(p.pis_percent || 0) +
        Number(p.cofins_percent || 0) +
        Number(p.csll_percent || 0) +
        Number(p.irpj_percent || 0)) /
      100;
    return Number(p.base_cost) * (1 + tax);
  };

  const calcPrice = (p: Product) =>
    calcTaxCost(p) * (1 + Number(p.margin_percent || 30) / 100);

  return (
    <div>
      <PageHeader
        title="Serviços"
        description="Catálogo de serviços para orçamentos e ordens de serviço"
        icon={Wrench}
        action={
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo Serviço
          </Button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, código, categoria..."
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
            Nenhum serviço encontrado.{" "}
            <button className="text-primary underline" onClick={() => setDialogOpen(true)}>
              Criar primeiro serviço
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Código", "Nome", "Técnico", "Categoria", "Custo Base", "Preço Sugerido", "Margem", "Status", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((service) => (
                  <tr
                    key={service.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono">{service.code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{service.name}</td>
                    <td className="px-4 py-3 text-sm">{getTechName((service as any).technician_id)}</td>
                    <td className="px-4 py-3 text-sm">{service.category || "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">
                      R$ {Number(service.base_cost).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-primary">
                      R$ {calcPrice(service).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm">{Number(service.margin_percent || 30)}%</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={service.status} />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setEditingService(service)}
                      >
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
        title="Novo Serviço"
        fields={serviceFields}
        initialValues={{ code: generateNextCode() }}
        onSubmit={handleCreate}
      />
      <CrudDialog
        open={!!editingService}
        onOpenChange={(open) => !open && setEditingService(null)}
        title="Editar Serviço"
        fields={serviceFields}
        initialValues={editingService || {}}
        onSubmit={handleUpdate}
      />
      {techDialogOpen && (
        <CrudDialog
          open={techDialogOpen}
          onOpenChange={setTechDialogOpen}
          title="Novo Técnico (Rápido)"
          fields={techQuickFields}
          onSubmit={handleCreateTechnician}
        />
      )}
    </div>
  );
};

export default ServicesPage;
