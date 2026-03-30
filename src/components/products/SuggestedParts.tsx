import { useMemo } from "react";
import { Package, Plus, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useModelCompatibleProducts } from "@/hooks/useProductCompatibility";
import { SUGGESTED_PARTS_LIMIT } from "@/constants/limits";

interface Props {
  modelId?: string;
  modelName?: string;
  onSelect: (product: any, itemType: string) => void;
  itemTypes?: { value: string; label: string }[];
}

const defaultTypes = [
  { value: "peca_cobrada", label: "Cobrada" },
  { value: "peca_garantia", label: "Garantia" },
];

export function SuggestedParts({ modelId, modelName, onSelect, itemTypes = defaultTypes }: Props) {
  const { data: products, isLoading } = useModelCompatibleProducts(modelId);

  const sorted = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p: any) => p.status === "ativo")
      .sort((a: any, b: any) => a.name.localeCompare(b.name))
      .slice(0, SUGGESTED_PARTS_LIMIT);
  }, [products]);

  if (!modelId) return null;
  if (isLoading) return null;
  if (!sorted.length) return (
    <div className="bg-card rounded-xl border p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Peças sugeridas para {modelName}</h3>
      </div>
      <p className="text-xs text-muted-foreground">Nenhuma peça com compatibilidade cadastrada para este modelo. Cadastre compatibilidades na página de Produtos.</p>
    </div>
  );

  return (
    <div className="bg-card rounded-xl border p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Peças sugeridas para {modelName}</h3>
        <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded font-medium">{sorted.length} compatíveis</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {sorted.map((p: any) => (
          <div key={p.id} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
            <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{p.name}</p>
              <p className="text-[10px] font-mono text-primary">{p.code}</p>
            </div>
            <p className="text-[10px] font-mono shrink-0">R$ {Number(p.base_cost).toFixed(2)}</p>
            <div className="flex gap-0.5 shrink-0">
              {itemTypes.map((t) => (
                <Button
                  key={t.value}
                  size="sm"
                  variant={t.value.includes("garantia") ? "secondary" : "default"}
                  className="h-5 text-[9px] px-1"
                  onClick={() => onSelect(p, t.value)}
                >
                  <Plus className="h-2.5 w-2.5" />
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
