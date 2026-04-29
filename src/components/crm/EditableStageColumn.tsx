// src/components/crm/EditableStageColumn.tsx
import { GripVertical, Trash2, Zap, Plus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PipelineStageDB } from "@/hooks/usePipelineStages";
import type { AutomationActionType } from "@/hooks/useStageAutomations";
import { AutomationRow } from "@/components/crm/AutomationRow";

interface LocalAutomation {
  id: string;
  trigger_type: string;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  is_active: boolean;
  delay_minutes: number;
}

interface EditableStageColumnProps {
  stage: PipelineStageDB;
  automations: LocalAutomation[];
  cardCount: number;
  onUpdate: (updates: Partial<Pick<PipelineStageDB, "label" | "color" | "delay_minutes">>) => void;
  onDelete: () => void;
  onAutomationsChange: (automations: LocalAutomation[]) => void;
}

const STAGE_COLORS = [
  "hsl(0 0% 45%)",
  "hsl(210 80% 55%)",
  "hsl(38 92% 50%)",
  "hsl(280 60% 55%)",
  "hsl(142 71% 45%)",
  "hsl(0 84% 60%)",
  "hsl(199 89% 48%)",
  "hsl(330 81% 60%)",
  "hsl(24 95% 53%)",
  "hsl(262 83% 58%)",
];

export function EditableStageColumn({
  stage,
  automations,
  cardCount,
  onUpdate,
  onDelete,
  onAutomationsChange,
}: EditableStageColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function addAutomation() {
    const newAuto: LocalAutomation = {
      id: `temp-${Date.now()}`,
      trigger_type: "on_enter",
      action_type: "create_task",
      action_config: {},
      is_active: true,
      delay_minutes: 0,
    };
    onAutomationsChange([...automations, newAuto]);
  }

  function updateAutomation(index: number, updated: LocalAutomation) {
    const next = automations.map((a, i) => (i === index ? updated : a));
    onAutomationsChange(next);
  }

  function deleteAutomation(index: number) {
    onAutomationsChange(automations.filter((_, i) => i !== index));
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-[280px] flex-shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 shadow-sm flex flex-col"
    >
      {/* Cabeçalho: grip + label + delete */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-zinc-600 hover:text-zinc-400 flex-shrink-0"
          title="Arrastar"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <Input
          value={stage.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-7 text-sm flex-1 bg-zinc-800 border-zinc-600 text-zinc-100"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0 text-zinc-500 hover:text-destructive"
          onClick={onDelete}
          title="Excluir etapa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Color swatches */}
      <div className="px-3 pb-2">
        <div className="flex gap-1.5 flex-wrap">
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onUpdate({ color: c })}
              className={`h-6 w-6 rounded-md transition-all flex-shrink-0 ${
                stage.color === c ? "ring-2 ring-primary ring-offset-1 ring-offset-zinc-900" : ""
              }`}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Delay */}
      <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-400 flex-shrink-0">⏱ Atrasado após</span>
        <Input
          type="number"
          min={0}
          value={Math.floor(stage.delay_minutes / 60)}
          onChange={(e) => onUpdate({ delay_minutes: Number(e.target.value) * 60 + (stage.delay_minutes % 60) })}
          className="h-8 w-16 text-xs bg-zinc-800 border-zinc-600 text-zinc-100"
        />
        <span className="text-xs text-zinc-400 flex-shrink-0">h</span>
        <Input
          type="number"
          min={0}
          max={59}
          value={stage.delay_minutes % 60}
          onChange={(e) => onUpdate({ delay_minutes: Math.floor(stage.delay_minutes / 60) * 60 + Math.min(59, Number(e.target.value)) })}
          className="h-8 w-16 text-xs bg-zinc-800 border-zinc-600 text-zinc-100"
        />
        <span className="text-xs text-zinc-400 flex-shrink-0">min</span>
      </div>

      {/* Divisor */}
      <div className="border-t border-zinc-700" />

      {/* Seção de automações */}
      <div className="px-3 pt-2 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-medium text-zinc-200">Automações</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={addAutomation}
          >
            <Plus className="h-3 w-3" />
            Adicionar
          </Button>
        </div>

        {automations.length === 0 ? (
          <p className="text-xs text-zinc-500 italic text-center py-2">
            Nenhuma automação
          </p>
        ) : (
          <div className="space-y-2">
            {automations.map((auto, index) => (
              <AutomationRow
                key={auto.id}
                automation={auto}
                onChange={(updated) => updateAutomation(index, updated)}
                onDelete={() => deleteAutomation(index)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Divisor */}
      <div className="border-t border-zinc-700 mt-auto" />

      {/* Rodapé: contagem de cards */}
      <div className="px-3 py-2">
        <span className="text-xs text-zinc-500">
          {cardCount} card{cardCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
