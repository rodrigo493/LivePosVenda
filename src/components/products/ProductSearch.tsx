import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, Plus, Package, CheckCircle2, Circle, Minus, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/useProducts";
import { useAllCompatibility } from "@/hooks/useProductCompatibility";
import { SEARCH_RESULTS_LIMIT } from "@/constants/limits";
import { cn } from "@/lib/utils";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) as string;

interface ProductSearchProps {
  modelFilter?: string;
  modelId?: string;
  onSelect: (product: any, itemType: string) => void;
  itemTypes?: { value: string; label: string }[];
  productTypeFilter?: "peca" | "servico" | "materia_prima";
  showNomusStock?: boolean;
}

// Normaliza tipo de produto: minúsculo, sem acentos — para comparação robusta
const normalizeProductType = (v?: string | null) =>
  (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

type StockEntry = { loading: boolean; qty: number | null; custoMedio: number | null; preco: number | null };
type NomusProduct = { id: number; nome: string; codigo: string; preco: number; unidade: string; ativo: boolean };

// Fila global: serializa chamadas à edge function nomus-search com 400ms de intervalo
let _nomusQueue: Promise<void> = Promise.resolve();

const _nomusEnqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  _nomusQueue = _nomusQueue.then(
    () => new Promise<void>(done =>
      setTimeout(async () => {
        try { resolve(await fn()); } catch (e) { reject(e); }
        done();
      }, 400)
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
  const [nomusHits, setNomusHits] = useState<NomusProduct[]>([]);
  const [nomusLoading, setNomusLoading] = useState(false);
  const nomusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Busca produtos no Nomus com debounce de 500ms
  useEffect(() => {
    if (nomusTimerRef.current) clearTimeout(nomusTimerRef.current);
    const q = query.trim();
    if (!q || q.length < 2) { setNomusHits([]); return; }
    nomusTimerRef.current = setTimeout(async () => {
      setNomusLoading(true);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/nomus-search`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${ANON_KEY}`, "apikey": ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ type: "produtos", query: q }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const hits: NomusProduct[] = Array.isArray(data?.results) ? data.results.filter((r: any) => r.ativo !== false) : [];
        setNomusHits(hits);
      } catch {
        setNomusHits([]);
      } finally {
        setNomusLoading(false);
      }
    }, 500);
    return () => { if (nomusTimerRef.current) clearTimeout(nomusTimerRef.current); };
  }, [query]);

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
        if (productTypeFilter === "materia_prima") {
          return normalizeProductType(p.product_type) === "materia prima";
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
        if (a.code.toLowerCase() === q) return -1;
        if (b.code.toLowerCase() === q) return 1;
        if (modelFilter && compatMap) {
          const aCompat = compatMap[a.id]?.some((m) => m.toLowerCase().includes(modelFilter.toLowerCase())) ? 0 : 1;
          const bCompat = compatMap[b.id]?.some((m) => m.toLowerCase().includes(modelFilter.toLowerCase())) ? 0 : 1;
          if (aCompat !== bCompat) return aCompat - bCompat;
        }
        const aCodeStart = a.code.toLowerCase().startsWith(q) ? 0 : 1;
        const bCodeStart = b.code.toLowerCase().startsWith(q) ? 0 : 1;
        if (aCodeStart !== bCodeStart) return aCodeStart - bCodeStart;
        const aNameStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bNameStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aNameStart !== bNameStart) return aNameStart - bNameStart;
        if (modelFilter) {
          const aCompat = a.compatibility?.toLowerCase().includes(modelFilter.toLowerCase()) ? 0 : 1;
          const bCompat = b.compatibility?.toLowerCase().includes(modelFilter.toLowerCase()) ? 0 : 1;
          if (aCompat !== bCompat) return aCompat - bCompat;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, SEARCH_RESULTS_LIMIT);
  }, [products, query, modelFilter, compatMap, productTypeFilter]);

  // Busca estoque sob demanda ao passar o mouse — via edge function nomus-search
  const handleMouseEnter = async (code: string) => {
    if (!code || fetchedRef.current.has(code)) return;
    fetchedRef.current.add(code);
    setStockMap(prev => ({ ...prev, [code]: { loading: true, qty: null, custoMedio: null, preco: null } }));
    try {
      const res = await _nomusEnqueue(() =>
        fetch(`${SUPABASE_URL}/functions/v1/nomus-search`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${ANON_KEY}`,
            "apikey": ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ type: "estoque", query: code }),
        })
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const qty = typeof data?.saldo === "number" ? data.saldo : null;
      const custoMedio = typeof data?.custoMedio === "number" && data.custoMedio > 0 ? data.custoMedio : null;
      const preco = typeof data?.preco === "number" && data.preco > 0 ? data.preco : null;
      setStockMap(prev => ({ ...prev, [code]: { loading: false, qty, custoMedio, preco } }));
    } catch {
      setStockMap(prev => ({ ...prev, [code]: { loading: false, qty: null, custoMedio: null, preco: null } }));
    }
  };

  const renderStock = (code: string) => {
    const s = stockMap[code];
    if (!s) return null;
    if (s.loading) {
      return <span className="text-[10px] text-muted-foreground animate-pulse whitespace-nowrap">estoque…</span>;
    }
    if (s.qty === null) return null;
    return (
      <span className={cn(
        "text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap",
        s.qty > 0
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
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
    setNomusHits([]);
  };

  // Produtos do Nomus que não existem localmente (filtro por código)
  const localCodes = useMemo(() => new Set((products || []).map((p) => p.code?.toLowerCase())), [products]);
  const nomusOnlyHits = useMemo(
    () => nomusHits.filter((nr) => !localCodes.has((nr.codigo || '').toLowerCase())),
    [nomusHits, localCodes]
  );

  const handleAddNomus = useCallback((nr: NomusProduct, itemType: string) => {
    const synthetic = {
      id: null,
      _nomusId: nr.id,
      name: nr.nome,
      code: nr.codigo,
      base_cost: nr.preco,
      margin_percent: 0,
      ipi_percent: 0,
      unit: nr.unidade || 'un',
      status: 'ativo',
      product_type: 'peca',
      _fromNomus: true,
    };
    onSelect(synthetic, itemType);
    setQuery("");
    setOpen(false);
    setNomusHits([]);
  }, [onSelect]);

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
      {open && (filtered.length > 0 || nomusOnlyHits.length > 0 || nomusLoading) && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {filtered.map((p) => {
            const compat = getCompatLabel(p.id);
            return (
              <div
                key={p.id}
                className="px-3 py-2.5 hover:bg-muted/50 border-b last:border-0 transition-colors"
                onMouseEnter={() => handleMouseEnter(p.code)}
              >
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
                    {(() => {
                      const entry = stockMap[p.code];
                      const baseCost = Number(p.base_cost);
                      const nomusPreco = entry?.preco ?? entry?.custoMedio ?? null;
                      const preco = baseCost > 0 ? baseCost : (nomusPreco ?? 0);
                      return (
                        <p className="text-xs font-mono font-medium">
                          R$ {preco.toFixed(2)}
                          {baseCost === 0 && nomusPreco && (
                            <span className="text-[9px] text-muted-foreground ml-1">(Nomus)</span>
                          )}
                        </p>
                      );
                    })()}
                    <p className="text-[10px] text-muted-foreground">{p.unit || "un"}</p>
                    {renderStock(p.code)}
                  </div>
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
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 bg-muted/30 text-[10px] text-muted-foreground text-center border-b">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} no cadastro local
            </div>
          )}

          {/* Seção Nomus — produtos não cadastrados localmente */}
          {(nomusLoading || nomusOnlyHits.length > 0) && (
            <>
              <div className="px-3 py-1.5 flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/30 border-b">
                <Zap className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400">Disponível no Nomus</span>
                {nomusLoading && <span className="text-[10px] text-blue-400 animate-pulse ml-1">buscando…</span>}
              </div>
              {nomusOnlyHits.map((nr) => (
                <div key={nr.id} className="px-3 py-2.5 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-b last:border-0 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <p className="text-sm font-medium truncate">{nr.nome}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 ml-5.5">
                        <span className="text-xs font-mono text-primary">{nr.codigo}</span>
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">Nomus</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 mr-1">
                      <p className="text-xs font-mono font-medium">R$ {(nr.preco || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">{nr.unidade || "un"}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap max-w-[220px]">
                      {itemTypes.slice(0, 4).map((t) => (
                        <Button
                          key={t.value}
                          size="sm"
                          variant={t.value.includes("garantia") ? "secondary" : "default"}
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => handleAddNomus(nr, t.value)}
                        >
                          <Plus className="h-3 w-3 mr-0.5" />
                          {t.label.replace("Peça (", "").replace("Serviço (", "").replace(")", "")}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
      {open && query.trim() && filtered.length === 0 && nomusOnlyHits.length === 0 && !nomusLoading && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg p-4 text-center text-sm text-muted-foreground">
          Nenhuma peça encontrada para "{query}"
        </div>
      )}
    </div>
  );
}
