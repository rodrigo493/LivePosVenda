import { useState, useEffect, useMemo } from "react";
import { Box, Plus, Upload, Search, RefreshCw, Package2, AlertTriangle } from "lucide-react";
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

interface NomusProduct {
  id: number;
  codigo: string;
  descricao: string;
  siglaUnidadeMedida: string;
  saldoTotal: number;
  custoMedioUnitario: number | null;
  custoTotal: number | null;
  saldoPorSetor: NomusSectorStock[];
}

interface NomusCatalogInfo {
  id: number;
  custoMedioUnitario: number | null;
  saldoTotal: number;
  saldoPorSetor: NomusSectorStock[];
}

// Converte números no formato BR ("14,65" / "-6,00") para number
function parseNomusBR(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return Number(String(v).replace(/\./g, "").replace(",", ".")) || 0;
}

// ─── Nomus Catalog Hook (sem fetch extra — deriva do cache nomus-stock) ───────

function useNomusCatalog() {
  return useQuery<NomusProduct[], Error, Map<string, NomusCatalogInfo>>({
    queryKey: ["nomus-stock"],
    enabled: false, // nunca dispara fetch próprio — só consome cache existente
    select: (data) => {
      const map = new Map<string, NomusCatalogInfo>();
      for (const p of data) {
        const codigo = p.codigo.trim();
        if (codigo) map.set(codigo, {
          id: p.id,
          custoMedioUnitario: p.custoMedioUnitario,
          saldoTotal: p.saldoTotal,
          saldoPorSetor: p.saldoPorSetor ?? [],
        });
      }
      return map;
    },
  });
}

// ─── Nomus Stock Hook ─────────────────────────────────────────────────────────

// Flag e callbacks módulo-level: sobrevivem à navegação
let _nomusTriggered = false;
const _nomusTriggerCbs = new Set<() => void>();

function triggerNomusAll() {
  _nomusTriggered = true;
  _nomusTriggerCbs.forEach((fn) => fn());
}

// Fetch com retry automático em caso de 429 (rate limit do Nomus)
async function nomusFetch(path: string): Promise<any | null> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    const res = await fetch(`/api/nomus${path}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const wait = (Number(body.tempoAteLiberar) || 5) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  }
  return null;
}

function useNomusStock() {
  const [triggered, setTriggered] = useState(_nomusTriggered);

  useEffect(() => {
    _nomusTriggerCbs.add(setTriggered);
    return () => { _nomusTriggerCbs.delete(setTriggered); };
  }, []);

  const trigger = triggerNomusAll;

  const query = useQuery<NomusProduct[]>({
    queryKey: ["nomus-stock"],
    enabled: triggered,
    staleTime: 30 * 60_000,
    gcTime: Infinity, // mantém cache mesmo sem observadores (navegação)
    retry: false,
    queryFn: async () => {
      // Fase 1: buscar todos os produtos ativos
      const allRaw: any[] = [];
      let page = 1;
      while (page <= 30) {
        const data = await nomusFetch(`/rest/produtos?query=ativo=true&pagina=${page}`);
        if (!Array.isArray(data) || data.length === 0) break;
        allRaw.push(...data);
        if (data.length < 20) break;
        page++;
      }
      if (allRaw.length === 0) throw new Error("Nenhum produto retornado pelo Nomus");

      const products: NomusProduct[] = allRaw.map((p: any) => ({
        id: Number(p.id),
        codigo: String(p.codigo || ""),
        descricao: String(p.descricao || p.nome || ""),
        siglaUnidadeMedida: String(p.siglaUnidadeMedida || p.unidadeMedida || ""),
        saldoTotal: 0,
        custoMedioUnitario: null,
        custoTotal: null,
        saldoPorSetor: [],
      }));

      // Fase 2: saldo por produto — filtra empresa 2, parseia números BR
      const fetchSaldo = async (p: NomusProduct) => {
        const data = await nomusFetch(`/rest/saldosEstoqueProduto/${p.id}`);
        if (!Array.isArray(data)) return;
        // Prefere empresa 2; fallback para primeira disponível
        const empresa = data.find((e: any) => Number(e.idEmpresa) === 2) ?? data[0];
        if (!empresa) return;
        p.custoMedioUnitario = empresa.custoMedioUnitario != null
          ? parseNomusBR(empresa.custoMedioUnitario) : null;
        p.saldoPorSetor = (empresa.saldos || []).map((s: any): NomusSectorStock => ({
          idSetorEstoque: Number(s.idSetorEstoque),
          nomeSetorEstoque: String(s.nomeSetorEstoque || ""),
          saldo: parseNomusBR(s.saldo),
        }));
        p.saldoTotal = p.saldoPorSetor.reduce((sum, s) => sum + s.saldo, 0);
        p.custoTotal = p.custoMedioUnitario != null ? p.custoMedioUnitario * p.saldoTotal : null;
      };

      for (let i = 0; i < products.length; i += 5) {
        await Promise.all(products.slice(i, i + 5).map(fetchSaldo));
      }

      return products.sort((a, b) => b.saldoTotal - a.saldoTotal || a.descricao.localeCompare(b.descricao, "pt-BR"));
    },
  });

  return { ...query, triggered, trigger };
}

// ─── Nomus Stock Table ────────────────────────────────────────────────────────

function NomusStockTab() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching, triggered, trigger } = useNomusStock();

  const filtered = (data || []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.descricao.toLowerCase().includes(q) ||
      p.codigo.toLowerCase().includes(q)
    );
  });

  const totalSaldo = filtered.reduce((s, p) => s + p.saldoTotal, 0);
  const totalValor = filtered.reduce((s, p) => s + (p.custoTotal ?? 0), 0);

  if (!triggered) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Package2 className="h-10 w-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Consultar estoque do Nomus ERP</p>
          <p className="text-xs text-muted-foreground mt-1">
            Busca todos os produtos ativos com saldo e custo médio unitário em tempo real.
          </p>
        </div>
        <Button onClick={trigger} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Carregar estoque
        </Button>
      </div>
    );
  }

  if (isLoading || isFetching) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <RefreshCw className="h-8 w-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          Buscando produtos e calculando custos no Nomus…<br />
          <span className="text-xs">Isso pode levar alguns segundos.</span>
        </p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm text-destructive">
          {(error as Error)?.message || "Erro ao consultar Nomus"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por código ou descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
        {data && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""}
            {filtered.some((p) => p.saldoTotal > 0) && (
              <> &middot; Valor total: <strong>R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></>
            )}
          </span>
        )}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-xl border shadow-card overflow-hidden"
      >
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {search ? "Nenhum produto encontrado para a busca." : "Nenhum produto retornado."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {["Código", "Descrição", "Unid.", "Saldo em Estoque", "Custo Médio Unit.", "Valor Total Estoque"].map((h) => (
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
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 transition-colors ${
                      p.saldoTotal > 0 ? "hover:bg-muted/30" : "opacity-50 hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{p.codigo}</td>
                    <td className="px-4 py-3 text-sm font-medium max-w-xs truncate">{p.descricao}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.siglaUnidadeMedida || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm font-mono font-semibold ${
                          p.saldoTotal > 0 ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        {p.saldoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {p.custoMedioUnitario != null
                        ? `R$ ${p.custoMedioUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-primary">
                      {p.custoTotal != null && p.custoTotal > 0
                        ? `R$ ${p.custoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : <span className="text-muted-foreground font-normal text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 1 && totalValor > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3} className="px-4 py-2.5 text-xs text-muted-foreground font-medium">
                      Total ({filtered.filter((p) => p.saldoTotal > 0).length} com estoque)
                    </td>
                    <td className="px-4 py-2.5 text-sm font-mono font-bold text-emerald-600">
                      {totalSaldo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-sm font-mono font-bold text-primary">
                      R$ {totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Products Page ────────────────────────────────────────────────────────────

const ProductsPage = () => {
  const { data: products, isLoading } = useProducts();
  const nomusCatalog = useNomusCatalog();
  const { trigger: triggerNomus } = useNomusStock();
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
  const [view, setView] = useState<"catalogo" | "estoque">("catalogo");

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
          view === "catalogo" ? (
            <div className="flex gap-2">
              {!nomusCatalog.data ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={triggerNomus}
                  disabled={nomusCatalog.isLoading}
                >
                  <Package2 className="h-3.5 w-3.5" />
                  {nomusCatalog.isLoading ? "Carregando Nomus..." : "Carregar Estoque Nomus"}
                </Button>
              ) : setoresDisponiveis.length > 0 ? (
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
              ) : null}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Importar CSV
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Novo Produto
              </Button>
            </div>
          ) : null
        }
      />

      {/* View toggle */}
      <div className="flex gap-1 mb-4 p-1 bg-muted/50 rounded-lg w-fit border">
        <button
          onClick={() => setView("catalogo")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
            view === "catalogo"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Catálogo interno
        </button>
        <button
          onClick={() => setView("estoque")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            view === "estoque"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package2 className="h-3.5 w-3.5" />
          Estoque Nomus
        </button>
      </div>

      {/* ── Catálogo interno ── */}
      {view === "catalogo" && (
        <>
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
                      const nomusInfo =
                        nomusCatalog.data?.get(product.code.trim()) ??
                        (product.secondary_code ? nomusCatalog.data?.get(product.secondary_code.trim()) : undefined);
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
                          {nomusCatalog.isLoading ? (
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
                          {nomusCatalog.isLoading ? (
                            <span className="text-muted-foreground text-xs animate-pulse">...</span>
                          ) : nomusInfo?.custoMedioUnitario != null ? (
                            `R$ ${nomusInfo.custoMedioUnitario.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {nomusInfo != null ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                              #{nomusInfo.id}
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
        </>
      )}

      {/* ── Estoque Nomus ── */}
      {view === "estoque" && <NomusStockTab />}

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
