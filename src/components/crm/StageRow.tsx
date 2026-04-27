// src/components/crm/StageRow.tsx
import { useState } from "react";
import { GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PipelineStageDB } from "@/hooks/usePipelineStages";

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

interface StageRowProps {
  stage: PipelineStageDB;
  onEdit: (id: string, label: string, color: string, delayMinutes: number) => void;
  onDelete: (id: string) => void;
}

export function StageRow({ stage, onEdit, onDelete }: StageRowProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(stage.label);
  const [color, setColor] = useState(stage.color);
  const [delayMinutes, setDelayMinutes] = useState(stage.delay_minutes);

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function handleSave() {
    if (!label.trim()) return;
    onEdit(stage.id, label.trim(), color, delayMinutes);
    setEditing(false);
  }

  function handleCancel() {
    setLabel(stage.label);
    setColor(stage.color);
    setDelayMinutes(stage.delay_minutes);
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-card">
      {/* Row principal */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: stage.color }} />
        <span className="flex-1 text-sm">{stage.label}</span>
        {!editing && (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(stage.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Form inline de edição */}
      {editing && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Nome</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 mt-1" autoFocus />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cor</label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-md transition-all ${color === c ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tempo para "atrasado"</label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={Math.floor(delayMinutes / 60)}
                onChange={(e) => setDelayMinutes(Number(e.target.value) * 60 + (delayMinutes % 60))}
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">h</span>
              <Input
                type="number"
                min={0}
                max={59}
                value={delayMinutes % 60}
                onChange={(e) => setDelayMinutes(Math.floor(delayMinutes / 60) * 60 + Math.min(59, Number(e.target.value)))}
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Check className="h-3.5 w-3.5 mr-1" /> Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
