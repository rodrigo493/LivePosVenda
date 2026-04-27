// src/components/crm/UserAccessDialog.tsx
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { usePipelines } from "@/hooks/usePipelines";
import { usePipelineStages } from "@/hooks/usePipelineStages";
import { useAllUsers, useUserAccess, useSaveUserAccess } from "@/hooks/useUserAccess";

interface UserAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PipelineAccessRow({
  pipelineId,
  pipelineName,
  checkedPipelines,
  checkedStages,
  onTogglePipeline,
  onToggleStage,
}: {
  pipelineId: string;
  pipelineName: string;
  checkedPipelines: Set<string>;
  checkedStages: Set<string>;
  onTogglePipeline: (pid: string, stageIds: string[]) => void;
  onToggleStage: (sid: string) => void;
}) {
  const { data: stages = [] } = usePipelineStages(pipelineId);
  const isPipelineChecked = checkedPipelines.has(pipelineId);

  return (
    <div className="mb-3">
      <div className={`flex items-center gap-3 rounded-t-lg border px-3 py-2 ${isPipelineChecked ? "bg-card" : "bg-muted/20"}`}>
        <Checkbox
          checked={isPipelineChecked}
          onCheckedChange={() => onTogglePipeline(pipelineId, stages.map((s) => s.id))}
        />
        <span className="text-sm font-semibold flex-1">{pipelineName}</span>
        <span className="text-xs text-muted-foreground">{stages.length} etapas</span>
      </div>

      {isPipelineChecked && stages.length > 0 && (
        <div className="border border-t-0 rounded-b-lg bg-muted/10 px-3 py-2 space-y-1.5">
          {stages.map((stage) => (
            <div key={stage.id} className="flex items-center gap-3 pl-2">
              <Checkbox
                checked={checkedStages.has(stage.id)}
                onCheckedChange={() => onToggleStage(stage.id)}
              />
              <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: stage.color }} />
              <span className={`text-sm ${checkedStages.has(stage.id) ? "text-foreground" : "text-muted-foreground"}`}>
                {stage.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserAccessDialog({ open, onOpenChange }: UserAccessDialogProps) {
  const { data: users = [] } = useAllUsers();
  const { data: pipelines = [] } = usePipelines();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: access } = useUserAccess(selectedUserId);
  const saveAccess = useSaveUserAccess();

  const [checkedPipelines, setCheckedPipelines] = useState<Set<string>>(new Set());
  const [checkedStages, setCheckedStages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (access) {
      setCheckedPipelines(new Set(access.pipelineIds));
      setCheckedStages(new Set(access.stageIds));
    }
  }, [access]);

  useEffect(() => {
    if (open && users.length > 0 && !selectedUserId) {
      setSelectedUserId(users[0].user_id);
    }
  }, [open, users, selectedUserId]);

  function handleTogglePipeline(pipelineId: string, stageIds: string[]) {
    setCheckedPipelines((prev) => {
      const next = new Set(prev);
      if (next.has(pipelineId)) {
        next.delete(pipelineId);
        setCheckedStages((ps) => {
          const ns = new Set(ps);
          stageIds.forEach((sid) => ns.delete(sid));
          return ns;
        });
      } else {
        next.add(pipelineId);
        setCheckedStages((ps) => {
          const ns = new Set(ps);
          stageIds.forEach((sid) => ns.add(sid));
          return ns;
        });
      }
      return next;
    });
  }

  function handleToggleStage(stageId: string) {
    setCheckedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  async function handleSave() {
    if (!selectedUserId) return;
    await saveAccess.mutateAsync({
      userId: selectedUserId,
      pipelineIds: [...checkedPipelines],
      stageIds: [...checkedStages],
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle>Acesso de usuários</DialogTitle>
        </DialogHeader>

        <div className="flex h-[480px]">
          {/* Lista de usuários */}
          <div className="w-44 border-r flex-shrink-0">
            <p className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Usuários</p>
            <ScrollArea className="h-[calc(480px-36px)]">
              <div className="px-2 space-y-1">
                {users.map((u) => (
                  <button
                    key={u.user_id}
                    onClick={() => setSelectedUserId(u.user_id)}
                    className={`w-full flex flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent ${
                      u.user_id === selectedUserId ? "bg-accent" : ""
                    }`}
                  >
                    <span className="text-sm font-medium leading-none">{u.full_name}</span>
                    <span className="text-xs text-muted-foreground truncate w-full">{u.email}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Painel de funis e etapas */}
          <div className="flex-1 flex flex-col">
            {selectedUserId ? (
              <>
                <div className="px-4 py-3 border-b">
                  <p className="text-sm text-muted-foreground">
                    Selecione quais funis e etapas o usuário pode acessar
                  </p>
                </div>
                <ScrollArea className="flex-1 px-4 py-3">
                  {pipelines.map((p) => (
                    <PipelineAccessRow
                      key={p.id}
                      pipelineId={p.id}
                      pipelineName={p.name}
                      checkedPipelines={checkedPipelines}
                      checkedStages={checkedStages}
                      onTogglePipeline={handleTogglePipeline}
                      onToggleStage={handleToggleStage}
                    />
                  ))}
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Selecione um usuário
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!selectedUserId || saveAccess.isPending}>
            {saveAccess.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
