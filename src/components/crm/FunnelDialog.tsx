// src/components/crm/FunnelDialog.tsx
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
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
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StageRow } from "@/components/crm/StageRow";
import { usePipelineStages, type PipelineStageDB } from "@/hooks/usePipelineStages";
import { useCreatePipeline, useUpdatePipeline } from "@/hooks/useManagePipelines";
import { useCreateStage, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useManageStages";
import type { Pipeline } from "@/hooks/usePipelines";

interface FunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  pipeline?: Pipeline | null;
  onCreated?: (pipeline: Pipeline) => void;
}

export function FunnelDialog({ open, onOpenChange, mode, pipeline, onCreated }: FunnelDialogProps) {
  const [name, setName] = useState("");
  const { data: stages = [] } = usePipelineStages(mode === "edit" ? pipeline?.id : null);
  const [localStages, setLocalStages] = useState<PipelineStageDB[]>([]);

  const createPipeline = useCreatePipeline();
  const updatePipeline = useUpdatePipeline();
  const createStage = useCreateStage();
  const updateStage = useUpdateStage();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (open) {
      setName(mode === "edit" ? (pipeline?.name ?? "") : "");
      setLocalStages(stages);
    }
  }, [open, mode, pipeline, stages]);

  useEffect(() => {
    setLocalStages(stages);
  }, [stages]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalStages((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function handleAddStage() {
    const newStage: PipelineStageDB = {
      id: `temp-${Date.now()}`,
      pipeline_id: pipeline?.id ?? "",
      key: "",
      label: "Nova etapa",
      color: "hsl(210 80% 55%)",
      delay_days: 3,
      position: localStages.length,
    };
    setLocalStages((prev) => [...prev, newStage]);
  }

  async function handleEditStage(id: string, label: string, color: string, delayDays: number) {
    setLocalStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, label, color, delay_days: delayDays } : s))
    );
    if (pipeline?.id && !id.startsWith("temp-")) {
      await updateStage.mutateAsync({ id, pipelineId: pipeline.id, label, color, delayDays });
    }
  }

  async function handleDeleteStage(id: string) {
    if (id.startsWith("temp-")) {
      setLocalStages((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    if (!pipeline?.id) return;
    await deleteStage.mutateAsync({ id, pipelineId: pipeline.id });
    setLocalStages((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSave() {
    if (!name.trim()) return;

    if (mode === "create") {
      const newPipeline = await createPipeline.mutateAsync(name.trim());
      for (let i = 0; i < localStages.length; i++) {
        const s = localStages[i];
        await createStage.mutateAsync({
          pipelineId: newPipeline.id,
          label: s.label,
          color: s.color,
          delayDays: s.delay_days,
          position: i,
        });
      }
      onCreated?.(newPipeline);
    } else if (pipeline) {
      await updatePipeline.mutateAsync({ id: pipeline.id, name: name.trim() });
      const existingStages = localStages.filter((s) => !s.id.startsWith("temp-"));
      if (existingStages.length > 0) {
        await reorderStages.mutateAsync({
          pipelineId: pipeline.id,
          stages: existingStages.map((s, i) => ({ id: s.id, position: i })),
        });
      }
      const tempStages = localStages.filter((s) => s.id.startsWith("temp-"));
      for (let i = 0; i < tempStages.length; i++) {
        const s = tempStages[i];
        await createStage.mutateAsync({
          pipelineId: pipeline.id,
          label: s.label,
          color: s.color,
          delayDays: s.delay_days,
          position: existingStages.length + i,
        });
      }
    }

    onOpenChange(false);
  }

  const isSaving =
    createPipeline.isPending ||
    updatePipeline.isPending ||
    createStage.isPending ||
    updateStage.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Criar novo funil" : "Editar funil"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="funnel-name">Nome do funil</Label>
            <Input
              id="funnel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Comercial, Suporte..."
              className="mt-1"
              autoFocus
            />
          </div>

          <Tabs defaultValue="stages">
            <TabsList className="w-full">
              <TabsTrigger value="stages" className="flex-1">Etapas</TabsTrigger>
              <TabsTrigger value="access" className="flex-1" disabled>Acesso (em breve)</TabsTrigger>
            </TabsList>

            <TabsContent value="stages" className="space-y-2 mt-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  {localStages.map((stage) => (
                    <StageRow
                      key={stage.id}
                      stage={stage}
                      onEdit={handleEditStage}
                      onDelete={handleDeleteStage}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <button
                onClick={handleAddStage}
                className="w-full rounded-lg border border-dashed py-2 text-sm text-primary hover:bg-accent transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="h-4 w-4" /> Adicionar etapa
              </button>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
