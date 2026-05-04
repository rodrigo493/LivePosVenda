// src/components/tasks/TaskCreateDialog.tsx
import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import type { TaskRow } from "@/hooks/useTasks";
import { localDateStr } from "@/components/tasks/CalendarTaskBlock";
import { useAllUsers } from "@/hooks/useUserAccess";
import { useAuth } from "@/hooks/useAuth";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;    // yyyy-MM-dd
  defaultTime?: string;    // HH:MM
  defaultClientId?: string;
  defaultTicketId?: string;
  task?: TaskRow | null;   // quando fornecido, abre em modo edição
}

export function TaskCreateDialog({
  open, onOpenChange,
  defaultDate, defaultTime,
  defaultClientId, defaultTicketId,
  task,
}: Props) {
  const { user } = useAuth();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const { data: users } = useAllUsers();

  const isEditing = !!task;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate ?? localDateStr(new Date()));
  const [dueTime, setDueTime] = useState(defaultTime ?? "09:00");
  const [priority, setPriority] = useState("media");
  const [assignedTo, setAssignedTo] = useState(user?.id ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      if (task) {
        setTitle(task.title);
        setDescription(task.description ?? "");
        setDueDate(task.due_date ?? localDateStr(new Date()));
        setDueTime(task.due_time?.slice(0, 5) ?? "09:00");
        setPriority(task.priority ?? "media");
        setAssignedTo(task.assigned_to ?? user?.id ?? "");
      } else {
        setTitle("");
        setDescription("");
        setDueDate(defaultDate ?? localDateStr(new Date()));
        setDueTime(defaultTime ?? "09:00");
        setPriority("media");
        setAssignedTo(user?.id ?? "");
      }
    }
  }, [open, task, defaultDate, defaultTime, user?.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !assignedTo) return;
    try {
      if (isEditing) {
        await updateTask.mutateAsync({
          id: task!.id,
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate,
          due_time: dueTime || null,
          priority,
          assigned_to: assignedTo,
        });
        toast.success("Tarefa atualizada!");
      } else {
        await createTask.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          due_date: dueDate,
          due_time: dueTime || undefined,
          priority,
          assigned_to: assignedTo,
          created_by: user?.id,
          client_id: defaultClientId,
          ticket_id: defaultTicketId,
        });
        toast.success("Tarefa criada!");
      }
      onOpenChange(false);
    } catch {
      toast.error(isEditing ? "Erro ao atualizar tarefa" : "Erro ao criar tarefa");
    }
  }

  async function handleDelete() {
    if (!task) return;
    try {
      await deleteTask.mutateAsync(task.id);
      toast.success("Tarefa apagada.");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao apagar tarefa");
    }
  }

  const isBusy = createTask.isPending || updateTask.isPending || deleteTask.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Título *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ligar para cliente João"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-desc">Descrição</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Opcional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-date">Data *</Label>
              <Input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-time">Horário *</Label>
              <Input
                id="task-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Responsável *</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {isEditing ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Confirmar exclusão?</span>
                  <Button type="button" variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete} disabled={isBusy}>
                    {deleteTask.isPending ? "Apagando..." : "Sim, apagar"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
                    Não
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)} disabled={isBusy}>
                  <Trash2 className="h-3.5 w-3.5" /> Apagar
                </Button>
              )
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isBusy || !title.trim() || !assignedTo}>
                {isBusy && !deleteTask.isPending
                  ? "Salvando..."
                  : isEditing ? "Salvar" : "Criar Tarefa"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
