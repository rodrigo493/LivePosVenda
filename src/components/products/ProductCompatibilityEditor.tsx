import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProductCompatibility, useEquipmentModels, useSetProductCompatibility } from "@/hooks/useProductCompatibility";
import { toast } from "sonner";

interface Props {
  productId: string;
}

export function ProductCompatibilityEditor({ productId }: Props) {
  const { data: compat, isLoading: loadingCompat } = useProductCompatibility(productId);
  const { data: models, isLoading: loadingModels } = useEquipmentModels();
  const setCompat = useSetProductCompatibility();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (compat && !initialized) {
      setSelected(new Set(compat.map((c: any) => c.model_id)));
      setInitialized(true);
    }
  }, [compat, initialized]);

  const toggle = (modelId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const handleSave = async () => {
    await setCompat.mutateAsync({ productId, modelIds: Array.from(selected) });
    toast.success("Compatibilidade salva com sucesso");
  };

  if (loadingCompat || loadingModels) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Carregando modelos...</div>;
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Compatibilidade com Equipamentos</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {models?.map((model) => {
          const isSelected = selected.has(model.id);
          return (
            <button
              key={model.id}
              onClick={() => toggle(model.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/50"
              }`}
            >
              {isSelected && <Check className="h-3 w-3" />}
              {model.name}
            </button>
          );
        })}
        {!models?.length && <p className="text-xs text-muted-foreground">Nenhum modelo cadastrado.</p>}
      </div>
      {selected.size === 0 && (
        <p className="text-[10px] text-muted-foreground mb-2">Nenhum modelo selecionado — peça será tratada como genérica.</p>
      )}
      <Button size="sm" onClick={handleSave} disabled={setCompat.isPending} className="gap-1.5">
        {setCompat.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Salvar Compatibilidade
      </Button>
    </div>
  );
}
