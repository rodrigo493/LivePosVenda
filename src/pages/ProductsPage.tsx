import { useState, useMemo } from "react";
import { Box, Plus, Upload, Search, RefreshCw } from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

// ─── Nomus Types ─────────────────────────────────────────────────────────────

interface NomusSectorStock {
  idSetorEstoque: number;
  nomeSetorEstoque: string;
  saldo: number;
}

interface NomusCatalogInfo {
  id: number;
  custoMedioUnitario: number | null;
  saldoTotal: number;
  saldoPorSetor: NomusSectorStock[];
}

// ─── Nomus Products Hook (IDs — auto-carrega, rápido, direto no proxy Nginx) ──

const NOMUS_PROXY = "https://posvenda.liveuni.com.br/api/nomus";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function useNomusProducts() {
  return useQuery<Map<string, number>>({
    queryKey: ["nomus-products"],
    staleTime: 30 * 60_000,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const map = new Map<string, number>();
      let page = 1;
      while (page <= 50) {
        if (page > 1) await sleep(500);
        const res = await fetch(
          `${NOMUS_PROXY}/rest/produtos?query=ativo=true&pagina=${page}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) break;
        const data = await res.json().catch(() => null);
        if (!Array.isArray(data) || data.length === 0) break;
        for (const p of data) {
          const codigo = String(p.codigo || "").trim();
          if (codigo) map.set(codigo, Number(p.id));
        }
        if (data.length < 20) break;
        page++;
      }
      return map;
    },
  });
}

// ─── Nomus Catalog Hook (saldo+custo — trigger manual via Edge Function) ──────

function useNomusCatalog(enabled: boolean) {
  return useQuery<Map<string, NomusCatalogInfo>>({
    queryKey: ["nomus-stock"],
    enabled,
    staleTime: 30 * 60_000,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("nomus-stock");
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("Resposta inválida do Nomus");
      const map = new Map<string, NomusCatalogInfo>();
      for (const p of data as any[]) {
        const codigo = String(p.codigo || "").trim();
        if (codigo) {
          map.set(codigo, {
            id: Number(p.id),
            custoMedioUnitario: p.custoMedioUnitario != null ? Number(p.custoMedioUnitario) : null,
            saldoTotal: Number(p.saldoTotal) || 0,
            saldoPorSetor: Array.isArray(p.saldoPorSetor) ? p.saldoPorSetor : [],
          });
        }
      }
      return map;
    },
  });
}

// ─── Products Page ────────────────────────────────────────────────────────────

const ProductsPage = () => {
  const { data: products, isLoading } = useProducts();
  const nomusProducts = useNomusProducts();
  const [loadCatalogStock, setLoadCatalogStock] = useState(false);
  const nomusCatalog = useNomusCatalog(loadCatalogStock);
  const [selectedSetor, setSelectedSetor] = useState<number | null>(null);

  const setoresDisponiveis = useMemo(() => {
    if (!nomusCatalog.data) return [];
    const map = new Map<number, string>();
    for (const info of nomusCatalog.data.values()) {
      for (const s of info.saldoPorSetor) {
        if (!map.has(s.idSetorEstoque)) map.set(s.idSetorEstoque, s.nomeSetorEstoque);
      }
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [nomusCatalog.data]);

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
    const tax =
      (Number(p.ipi_percent) +
        Number(p.icms_percent) +
        Number(p.pis_percent) +
        Number(p.cofins_percent) +
        Number(p.csll_percent) +
        Number(p.irpj_percent)) /
      100;
    return Number(p.base_cost) * (1 + tax);
  };

  const calcPrice = (p: Product) => calcTaxCost(p) * (1 + Number(p.margin_percent) / 100);

  const filtered = products?.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.compatibility?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Produtos e Peças"
        description="Catálogo mestre de peças, preços, impostos e compatibilidade"
        icon={Box}
        action={
          <div className="flex gap-2">
            {!nomusCatalog.data && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => setLoadCatalogStock(true)}
                disabled={loadCatalogStock}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${nomusCatalog.isFetching ? "animate-spin" : ""}`} />
                {nomusCatalog.isFetching ? "Carregando estoque..." : "Carregar Estoque + Custo"}
              </Button>
            )}
            {setoresDisponiveis.length > 0 && (
              <select
                value={selectedSetor ?? ""}
                onChange={(e) => setSelectedSetor(e.target.value ? Number(e.target.value) : null)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos os setores</option>
                {setoresDisponiveis.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Importar CSV
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Novo Produto
            </Button>
          </div>
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
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum produto encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Código", "Nome", "Categoria", "Custo Base", "Preço Sugerido", "Margem", "Status", "Estoque Nomus", "Custo Médio", "ID Nomus", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const code = product.code.trim();
                  const secCode = product.secondary_code?.trim() ?? "";
                  const nomusId =
                    nomusProducts.data?.get(code) ??
                    (secCode ? nomusProducts.data?.get(secCode) : undefined);
                  const nomusInfo =
                    nomusCatalog.data?.get(code) ??
                    (secCode ? nomusCatalog.data?.get(secCode) : undefined);
                  const saldoSetor = nomusInfo
                    ? selectedSetor != null
                      ? (nomusInfo.saldoPorSetor.find((s) => s.idSetorEstoque === selectedSetor)?.saldo ?? 0)
                      : nomusInfo.saldoTotal
                    : null;
                  return (
                    <tr
                      key={product.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-mono">{product.code}</td>
                      <td className="px-4 py-3 text-sm font-medium">{product.name}</td>
                      <td className="px-4 py-3 text-sm">{product.category || "—"}</td>
                      <td className="px-4 py-3 text-sm font-mono">
                        R$ {Number(product.base_cost).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono font-medium text-primary">
                        R$ {calcPrice(product).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm">{Number(product.margin_percent)}%</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={product.status} />
                      </td>
                      <td className="px-4 py-3">
                        {nomusCatalog.isFetching ? (
                          <span className="text-muted-foreground text-xs animate-pulse">...</span>
                        ) : saldoSetor != null ? (
                          <span className={`text-sm font-mono font-semibold ${saldoSetor > 0 ? "text-emerald-600" : saldoSetor < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                            {saldoSetor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">
                        {nomusCatalog.isFetching ? (
                          <span className="text-muted-foreground text-xs animate-pulse">...</span>
                        ) : nomusInfo?.custoMedioUnitario != null ? (
                          `R$ ${nomusInfo.custoMedioUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {nomusProducts.isFetching ? (
                          <span className="text-muted-foreground text-xs animate-pulse">...</span>
                        ) : (nomusId ?? nomusInfo?.id) != null ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                            #{nomusId ?? nomusInfo?.id}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setEditingProduct(product)}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <CrudDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Novo Produto"
        fields={productFields}
        onSubmit={handleCreate}
      />
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
