// src/pages/TasksAgendaPage.tsx
import { useState, useMemo } from "react";
import {
  addDays, addWeeks, subWeeks, startOfWeek, endOfWeek, format, isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WeeklyCalendar } from "@/components/tasks/WeeklyCalendar";
import { TaskCreateDialog } from "@/components/tasks/TaskCreateDialog";
import { useTasks } from "@/hooks/useTasks";
import type { TaskRow } from "@/hooks/useTasks";

type ViewMode = "semana" | "dia";

const DAY_NAMES = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export default function TasksAgendaPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [viewMode, setViewMode] = useState<ViewMode>("semana");
  const [currentDay, setCurrentDay] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>();
  const [createDefaultTime, setCreateDefaultTime] = useState<string | undefined>();

  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const { data: tasks = [] } = useTasks();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const days = viewMode === "semana" ? weekDays : [currentDay];

  function goToToday() {
    const today = new Date();
    setWeekStart(startOfWeek(today, { weekStartsOn: 0 }));
    setCurrentDay(today);
  }

  function goPrev() {
    if (viewMode === "semana") setWeekStart((w) => subWeeks(w, 1));
    else setCurrentDay((d) => addDays(d, -1));
  }

  function goNext() {
    if (viewMode === "semana") setWeekStart((w) => addWeeks(w, 1));
    else setCurrentDay((d) => addDays(d, 1));
  }

  function periodLabel(): string {
    if (viewMode === "semana") {
      const end = endOfWeek(weekStart, { weekStartsOn: 0 });
      return `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(end, "d MMM yyyy", { locale: ptBR })}`;
    }
    return format(currentDay, "d 'de' MMMM yyyy", { locale: ptBR });
  }

  function handleSlotClick(day: Date, hour: number) {
    setCreateDefaultDate(format(day, "yyyy-MM-dd"));
    setCreateDefaultTime(`${String(hour).padStart(2, "0")}:00`);
    setCreateOpen(true);
  }

  function openCreateBlank() {
    setCreateDefaultDate(undefined);
    setCreateDefaultTime(undefined);
    setCreateOpen(true);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-2 font-semibold text-base mr-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          Tarefas
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={goPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={goNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-3 text-xs ml-1" onClick={goToToday}>
            Hoje
          </Button>
        </div>

        <span className="text-sm font-medium flex-1 min-w-[160px]">{periodLabel()}</span>

        <div className="flex border border-border rounded-md overflow-hidden">
          {(["dia", "semana"] as ViewMode[]).map((v) => (
            <button
              key={v}
              className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                viewMode === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
              onClick={() => setViewMode(v)}
            >
              {v === "dia" ? "Dia" : "Semana"}
            </button>
          ))}
        </div>

        <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={openCreateBlank}>
          <Plus className="h-3.5 w-3.5" />
          Nova tarefa
        </Button>
      </div>

      {/* ── Day header row ── */}
      <div
        className="grid shrink-0 border-b border-border bg-background"
        style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}
      >
        <div className="border-r border-border" />
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={`text-center py-2 border-r border-border last:border-r-0 ${
                today ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider">
                {DAY_NAMES[day.getDay()]}
              </div>
              <div
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold mt-0.5 ${
                  today
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Calendar grid ── */}
      <WeeklyCalendar
        days={days}
        tasks={tasks}
        onTaskClick={(task: TaskRow) => setEditingTask(task)}
        onSlotClick={handleSlotClick}
      />

      {/* ── Create dialog ── */}
      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultDate={createDefaultDate}
        defaultTime={createDefaultTime}
      />

      {/* ── Edit/Delete dialog ── */}
      <TaskCreateDialog
        open={!!editingTask}
        onOpenChange={(open) => { if (!open) setEditingTask(null); }}
        task={editingTask}
      />
    </div>
  );
}
