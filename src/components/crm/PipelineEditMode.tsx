// src/components/crm/PipelineEditMode.tsx
import { Pencil } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Pipeline } from "@/hooks/usePipelines";
import type { PipelineStageDB } from "@/hooks/usePipelineStages";
import type { AutomationActionType } from "@/hooks/useStageAutomations";
import { EditableStageColumn } from "@/components/crm/EditableStageColumn";

interface LocalAutomation {
  id: string;
  trigger_type: string;
  action_type: AutomationActionType;
  action_config: Record<string, unknown>;
  is_active: boolean;
}

interface PipelineEditModeProps {
  pipeline: Pipeline;
  stages: PipelineStageDB[];
  automations: Record<string, LocalAutomation[]>; // { [stageId]: LocalAutomation[] }
  cardCounts: Record<string, number>;              // { [stageKey]: count }
  onNameChange: (name: string) => void;
  onStagesChange: (stages: PipelineStageDB[]) => void;
  onAutomationsChange: (automations: Record<string, LocalAutomation[]>) => void;
  onAddStage: () => void;
  onDeleteStage: (stageId: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export function PipelineEditMode({
  pipeline,
  stages,
  automations,
  cardCounts,
  onNameChange,
  onStagesChange,
  onAutomationsChange,
  onAddStage,
  onDeleteStage,
  onSave,
  onCancel,
  isSaving,
}: PipelineEditModeProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(stages, oldIndex, newIndex).map((s, i) => ({
      ...s,
      position: i,
    }));
    onStagesChange(reordered);
  }

  function handleStageUpdate(
    stageId: string,
    updates: Partial<Pick<PipelineStageDB, "label" | "color" | "delay_days">>
  ) {
    onStagesChange(
      stages.map((s) => (s.id === stageId ? { ...s, ...updates } : s))
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Barra superior */}
      <div className="flex items-center gap-3 flex-wrap">
        <Pencil className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Input
          value={pipeline.name}
          onChange={(e) => onNameChange(e.target.value)}
          className="max-w-xs h-9"
          placeholder="Nome do funil"
        />

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
          <Button variant="outline" size="sm" onClick={onAddStage}>
            + Nova etapa
          </Button>
        </div>
      </div>

      {/* Área das colunas com DnD horizontal */}
      <div className="flex-1 overflow-x-auto overflow-y-auto pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={stages.map((s) => s.id)}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex gap-3 items-start min-w-max">
              {stages.map((stage) => (
                <EditableStageColumn
                  key={stage.id}
                  stage={stage}
                  automations={automations[stage.id] ?? []}
                  cardCount={cardCounts[stage.key] ?? 0}
                  onUpdate={(updates) => handleStageUpdate(stage.id, updates)}
                  onDelete={() => onDeleteStage(stage.id)}
                  onAutomationsChange={(autos) =>
                    onAutomationsChange({ ...automations, [stage.id]: autos })
                  }
                />
              ))}

              {stages.length === 0 && (
                <div className="flex items-center justify-center w-64 h-48 rounded-lg border border-dashed text-sm text-muted-foreground">
                  Nenhuma etapa. Clique em "+ Nova etapa".
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
