import { useState } from "react";
import { Box, Plus, Upload, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrudDialog } from "@/components/shared/CrudDialog";
import { useProducts, useCreateProduct, useUpdateProduct } from "@/hooks/useProducts";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProductImportDialog } from "@/components/products/ProductImportDialog";
import { ProductCompatibilityEditor } from "@/components/products/ProductCompatibilityEditor";
import { motion } from "framer-motion";
import { Product } from "@/types/database";

const productFields = [
  { name: "code", label: "Código", required: true, placeholder: "MOL-001" },
  { name: "secondary_code", label: "Código Secundário", placeholder: "Código ERP" },
  { name: "name", label: "Nome", required: true, placeholder: "Nome do produto/peça" },
  { name: "category", label: "Categoria", placeholder: "Molas, Cabos, Roldanas..." },
  { name: "subcategory", label: "Subcategoria" },
  { name: "product_group", label: "Grupo do Produto" },
  { name: "family", label: "Família" },
  { name: "compatibility", label: "Compatibilidade", placeholder: "Reformer V8, Todos..." },
  { name: "useful_life_months", label: "Vida Útil (meses)", type: "number" as const },
  { name: "unit", label: "Unidade", placeholder: "un, m, kg" },
  { name: "base_cost", label: "Custo Base (R$)", type: "number" as const, required: true },
  { name: "ipi_percent", label: "IPI (%)", type: "number" as const },
  { name: "icms_percent", label: "ICMS (%)", type: "number" as const },
  { name: "pis_percent", label: "PIS (%)", type: "number" as const },
  { name: "cofins_percent", label: "COFINS (%)", type: "number" as const },
  { name: "csll_percent", label: "CSLL (%)", type: "number" as const },
  { name: "irpj_percent", label: "IRPJ (%)", type: "number" as const },
  { name: "margin_percent", label: "Margem (%)", type: "number" as const },
  { name: "supplier", label: "Fornecedor", placeholder: "Nome do fornecedor" },
  { name: "technical_notes", label: "Observações Técnicas", type: "textarea" as const },
];

const ProductsPage = () => {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const handleCreate = async (values: Record<string, any>) => {
    await createProduct.mutateAsync(values as any);
  };

  const handleUpdate = async (values: Record<string, any>) => {
    if (!editingProduct) return;
    await updateProduct.mutateAsync({ id: editingProduct.id, ...values } as any);
    setEditingProduct(null);
  };

  const calcTaxCost = (p: Product) => {
    const tax = (Number(p.ipi_percent) + Number(p.icms_percent) + Number(p.pis_percent) + Number(p.cofins_percent) + Number(p.csll_percent) + Number(p.irpj_percent)) / 100;
    return Number(p.base_cost) * (1 + tax);
  };

  const calcPrice = (p: Product) => calcTaxCost(p) * (1 + Number(p.margin_percent) / 100);

  const filtered = products?.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.category?.toLowerCase().includes(q)) || (p.compatibility?.toLowerCase().includes(q));
  });

  return (
    <div>
      <PageHeader
        title="Produtos e Peças"
        description="Catálogo mestre de peças, preços, impostos e compatibilidade"
        icon={Box}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}><Upload className="h-3.5 w-3.5" /> Importar CSV</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo Produto</Button>
          </div>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, código, categoria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : !filtered?.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum produto encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Código", "Nome", "Categoria", "Compatibilidade", "Custo Base", "Preço Sugerido", "Margem", "Status", ""].map((h) => (
                    <th key={h} className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => (
                  <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono">{product.code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{product.name}</td>
                    <td className="px-4 py-3 text-sm">{product.category || "—"}</td>
                    <td className="px-4 py-3 text-sm">{product.compatibility || "—"}</td>
                    <td className="px-4 py-3 text-sm font-mono">R$ {Number(product.base_cost).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm font-mono font-medium text-primary">R$ {calcPrice(product).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{Number(product.margin_percent)}%</td>
                    <td className="px-4 py-3"><StatusBadge status={product.status} /></td>
                    <td className="px-4 py-3">
                      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setEditingProduct(product)}>Editar</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Novo Produto" fields={productFields} onSubmit={handleCreate} />
      <CrudDialog
        open={!!editingProduct}
        onOpenChange={(open) => !open && setEditingProduct(null)}
        title="Editar Produto"
        fields={productFields}
        initialValues={editingProduct || {}}
        onSubmit={handleUpdate}
        footer={editingProduct ? <ProductCompatibilityEditor productId={editingProduct.id} /> : undefined}
      />
      <ProductImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
};

export default ProductsPage;
