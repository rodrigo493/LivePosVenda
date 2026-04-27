// src/components/crm/FunnelSwitcher.tsx
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePipelines, type Pipeline } from "@/hooks/usePipelines";

interface FunnelSwitcherProps {
  currentPipelineId: string | null;
  onSelect: (pipeline: Pipeline) => void;
}

export function FunnelSwitcher({ currentPipelineId, onSelect }: FunnelSwitcherProps) {
  const { data: pipelines = [] } = usePipelines();

  // Oculta se o usuário tem acesso a apenas 1 funil
  if (pipelines.length <= 1) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-muted-foreground">
          <ChevronDown className="h-3.5 w-3.5" />
          <span className="text-xs">trocar funil</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p)}
            className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent ${
              p.id === currentPipelineId ? "bg-accent text-accent-foreground font-medium" : "text-foreground"
            }`}
          >
            {p.name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
