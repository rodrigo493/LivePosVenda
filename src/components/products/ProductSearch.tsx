import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Plus, Package, CheckCircle2, Circle, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/useProducts";
import { useAllCompatibility } from "@/hooks/useProductCompatibility";
import { SEARCH_RESULTS_LIMIT } from "@/constants/limits";
import { cn } from "@/lib/utils";

interface ProductSearchProps {
  modelFilter?: string;
  modelId?: string;
  onSelect: (product: any, itemType: string) => void;
  itemTypes?: { value: string; label: string }[];
  productTypeFilter?: "peca" | "servico";
  showNomusStock?: boolean;
}

type StockEntry = { loading: boolean; qty: number | null };

// Fila global: serializa requests Nomus com 300ms entre eles para evitar 429
let _nomusQueue: Promise<void> = Promise.resolve();

const _nomusGet = (url: string): Promise<Response> => {
  let resolve!: (r: Response) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
  _nomusQueue = _nomusQueue.then(
    () => new Promise<void>(done =>
      setTimeout(async () => {
        try { resolve(await fetch(url, { headers: { Accept: "application/json" } })); } catch (e) { reject(e); }
        done();
      }, 300)
    )
  );
  return promise;
};

const defaultItemTypes = [
  { value: "peca_cobrada", label: "Peça (Cobrada)" },
  { value: "peca_garantia", label: "Peça (Garantia)" },
  { value: "servico_cobrado", label: "Serviço (Cobrado)" },
  { value: "servico_garantia", label: "Serviço (Garantia)" },
  { value: "frete", label: "Frete" },
  { value: "desconto", label: "Desconto" },
];

export function ProductSearch({ modelFilter, modelId, onSelect, itemTypes = defaultItemTypes, productTypeFilter, showNomusStock }: ProductSearchProps) {
  const { data: products } = useProducts();
  const { data: compatMap } = useAllCompatibility();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [stockMap, setStockMap] = useState<Record<string, StockEntry>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!products || !query.trim()) return [];
    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/);

    return products
      .filter((p) => p.status === "ativo")
      .filter((p) => {
        if (productTypeFilter === "servico") {
          return p.product_type === "servico" || p.category === "servico";
        }
        if (productTypeFilter === "peca") {
          return p.product_type !== "servico" && p.category !== "servico";
        }
        return true;
      })
      .filter((p) => {
        const compatModels = compatMap?.[p.id]?.join(" ").toLowerCase() || "";
        const searchable = [
          p.code, p.name, p.category, p.compatibility,
          p.description, p.product_group, p.family, compatModels
        ].filter(Boolean).join(" ").toLowerCase();
        return tokens.every((t) => searchable.includes(t));
      })
      .sort((a, b) => {
        // 1. Exact code match
        if (a.code.toLowerCase() === q) return -1;
        if (b.code.toLowerCase() === q) return 1;
        // 2. Compatible with current model (real compatibility)
        if (modelFilter && compatMap) {
          const aCompat = compatMap[a.id]?.some((m) => m.toLowerCase().includes(modelFilter.toLowerCase())) ? 0 : 1;
          const bCompat = compatMap[b.id]?.some((m) => m.toLowerCase().includes(modelFilter.toLowerCase())) ? 0 : 1;
          if (aCompat !== bCompat) return aCompat - bCompat;
        }
        // 3. Code starts with query
        const aCodeStart = a.code.toLowerCase().startsWith(q) ? 0 : 1;
        const bCodeStart = b.code.toLowerCase().startsWith(q) ? 0 : 1;
        if (aCodeStart !== bCodeStart) return aCodeStart - bCodeStart;
        // 4. Name starts with query
        const aNameStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bNameStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aNameStart !== bNameStart) return aNameStart - bNameStart;
        // 5. Legacy compatibility field
        if (modelFilter) {
          const aCompat = a.compatibility?.toLowerCase().includes(modelFilter.toLowerCase()) ? 0 : 1;
          const bCompat = b.compatibility?.toLowerCase().includes(modelFilter.toLowerCase()) ? 0 : 1;
          if (aCompat !== bCompat) return aCompat - bCompat;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, SEARCH_RESULTS_LIMIT);
  }, [products, query, modelFilter, compatMap]);

  useEffect(() => {
    if (!showNomusStock || !filtered.length) return;

    const fetchStock = async (code: string) => {
      if (!code || fetchedRef.current.has(code)) return;
      fetchedRef.current.add(code);
      setStockMap(prev => ({ ...prev, [code]: { loading: true, qty: null } }));
      try {
        // 1. Busca o ID Nomus do produto pelo código (FIQL no endpoint de produtos)
        const pr = await _nomusGet(`/api/nomus/rest/produtos?query=codigo==${encodeURIComponent(code)}`);
        if (!pr.ok) throw new Error();
        const prData = await pr.json();
        const nomusId = Array.isArray(prData) && prData.length > 0 ? Number(prData[0].id) : null;
        if (!nomusId) throw new Error("not found");

        // 2. Busca saldo de estoque pelo ID Nomus
        const sr = await _nomusGet(`/api/nomus/rest/saldosEstoqueProduto/${nomusId}`);
        if (!sr.ok) throw new Error();
        const stockData = await sr.json();
        const total = Array.isArray(stockData)
          ? stockData.reduce((sum: number, s: any) => {
              const v = parseFloat((s.saldoTotal || "0").replace(",", "."));
              return sum + (isNaN(v) ? 0 : v);
            }, 0)
          : 0;
        setStockMap(prev => ({ ...prev, [code]: { loading: false, qty: Math.max(0, total) } }));
      } catch {
        setStockMap(prev => ({ ...prev, [code]: { loading: false, qty: null } }));
      }
    };

    filtered.forEach(p => fetchStock(p.code));
  }, [filtered, showNomusStock]);

  const renderStock = (code: string) => {
    const s = stockMap[code];
    if (!s || s.loading) {
      return <span className="text-[10px] text-muted-foreground animate-pulse whitespace-nowrap">estoque…</span>;
    }
    if (s.qty === null) return null;
    return (
      <span className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap",
        s.qty > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
      )}>
        {Math.round(s.qty)} em estoque
      </span>
    );
  };

  const getCompatLabel = (productId: string) => {
    if (!compatMap || !modelFilter) return null;
    const models = compatMap[productId];
    if (!models || models.length === 0) return "genérica";
    if (models.some((m) => m.toLowerCase().includes(modelFilter.toLowerCase()))) return "compatível";
    return "outro modelo";
  };

  const handleAdd = (product: any, itemType: string) => {
    onSelect(product, itemType);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar peça por código, nome, grupo, família, modelo..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim() && setOpen(true)}
          className="pl-9"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {filtered.map((p) => {
            const compat = getCompatLabel(p.id);
            return (
              <div key={p.id} className="px-3 py-2.5 hover:bg-muted/50 border-b last:border-0 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      {compat === "compatível" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-success/10 text-success px-1.5 py-0.5 rounded">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Compatível
                        </span>
                      )}
                      {compat === "genérica" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          <Circle className="h-2.5 w-2.5" /> Genérica
                        </span>
                      )}
                      {compat === "outro modelo" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium bg-warning/10 text-warning px-1.5 py-0.5 rounded">
                          <Minus className="h-2.5 w-2.5" /> Outro modelo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 ml-5.5">
                      <span className="text-xs font-mono text-primary">{p.code}</span>
                      {p.product_group && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{p.product_group}</span>
                      )}
                      {p.family && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{p.family}</span>
                      )}
                      {compatMap?.[p.id]?.length ? (
                        <span className="text-[10px] bg-accent/10 px-1.5 py-0.5 rounded text-accent-foreground">
                          {compatMap[p.id].join(", ")}
                        </span>
                      ) : p.compatibility ? (
                        <span className="text-[10px] bg-accent/10 px-1.5 py-0.5 rounded text-accent-foreground">{p.compatibility}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-1">
                    <p className="text-xs font-mono font-medium">R$ {Number(p.base_cost).toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">{p.unit || "un"}</p>
                    {p.stock_current != null && (
                      <p className="text-[10px] font-semibold" style={{ color: p.stock_current > 0 ? '#16a34a' : '#ea580c' }}>
                        {p.stock_current} em estoque
                      </p>
                    )}
                  </div>
                  {showNomusStock && (
                    <div className="shrink-0 self-center text-center min-w-[72px]">
                      {renderStock(p.code)}
                    </div>
                  )}
                  <div className="flex gap-1 shrink-0 flex-wrap max-w-[220px]">
                    {itemTypes.slice(0, 4).map((t) => (
                      <Button
                        key={t.value}
                        size="sm"
                        variant={t.value.includes("garantia") ? "secondary" : "default"}
                        className="h-6 text-[10px] px-1.5"
                        onClick={() => handleAdd(p, t.value)}
                      >
                        <Plus className="h-3 w-3 mr-0.5" />
                        {t.label.replace("Peça (", "").replace("Serviço (", "").replace(")", "")}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="px-3 py-1.5 bg-muted/30 text-[10px] text-muted-foreground text-center">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg p-4 text-center text-sm text-muted-foreground">
          Nenhuma peça encontrada para "{query}"
        </div>
      )}
    </div>
  );
}
