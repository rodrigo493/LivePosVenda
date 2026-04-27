// src/components/tasks/CalendarTaskBlock.tsx
import { TaskRow } from "@/hooks/useTasks";

export const HOUR_HEIGHT = 60;    // px per hour
export const GRID_START_HOUR = 6; // grid starts at 06:00

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function calcTaskTop(dueTime: string): number {
  const minutes = timeToMinutes(dueTime);
  return (minutes - GRID_START_HOUR * 60) * (HOUR_HEIGHT / 60);
}

export function isTaskOverdue(task: TaskRow): boolean {
  if (task.status === "concluida") return false;
  if (!task.due_date) return false;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (task.due_date < todayStr) return true;
  if (task.due_date === todayStr && task.due_time) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return timeToMinutes(task.due_time) < nowMinutes;
  }
  return false;
}

interface Props {
  task: TaskRow;
  topPx: number;
  onClick: (task: TaskRow) => void;
}

export function CalendarTaskBlock({ task, topPx, onClick }: Props) {
  const overdue = isTaskOverdue(task);

  const colorClass = overdue
    ? "bg-red-950 border-red-500 text-red-300"
    : task.priority === "alta"
    ? "bg-orange-950 border-orange-500 text-orange-300"
    : task.priority === "baixa"
    ? "bg-slate-800 border-slate-500 text-slate-300"
    : "bg-blue-950 border-blue-500 text-blue-300";

  const timeLabel = task.due_time ? task.due_time.slice(0, 5) : "";

  return (
    <div
      className={`absolute left-1 right-1 rounded border-l-[3px] px-2 py-1 cursor-pointer text-xs font-medium overflow-hidden z-10 transition-all hover:brightness-125 ${colorClass}`}
      style={{ top: topPx, height: 52 }}
      onClick={() => onClick(task)}
      title={task.title}
    >
      <div className="truncate font-semibold leading-tight">
        {overdue && "⚠ "}
        {task.title}
      </div>
      {timeLabel && (
        <div className="opacity-70 text-[10px] mt-0.5">{timeLabel}</div>
      )}
      {overdue && (
        <span className="inline-block bg-red-500 text-white text-[9px] font-bold rounded px-1 mt-0.5">
          ATRASADO
        </span>
      )}
    </div>
  );
}
