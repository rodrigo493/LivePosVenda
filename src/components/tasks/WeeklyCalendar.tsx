// src/components/tasks/WeeklyCalendar.tsx
import { useRef, useEffect, useState } from "react";
import { format, isToday } from "date-fns";
import { TaskRow } from "@/hooks/useTasks";
import {
  CalendarTaskBlock,
  calcTaskTop,
  HOUR_HEIGHT,
  GRID_START_HOUR,
} from "@/components/tasks/CalendarTaskBlock";

const GRID_END_HOUR = 22;
const HOURS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i
);

function currentTimeOffsetPx(): number {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (minutes - GRID_START_HOUR * 60) * (HOUR_HEIGHT / 60);
}

function tasksForDay(tasks: TaskRow[], day: Date): TaskRow[] {
  const dayStr = format(day, "yyyy-MM-dd");
  return tasks.filter((t) => t.due_date === dayStr && t.due_time != null);
}

interface Props {
  days: Date[];
  tasks: TaskRow[];
  onTaskClick: (task: TaskRow) => void;
  onSlotClick: (day: Date, hour: number) => void;
}

export function WeeklyCalendar({ days, tasks, onTaskClick, onSlotClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowPx, setNowPx] = useState(currentTimeOffsetPx);

  useEffect(() => {
    const offset = Math.max(0, currentTimeOffsetPx() - HOUR_HEIGHT * 2);
    scrollRef.current?.scrollTo({ top: offset, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowPx(currentTimeOffsetPx()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const totalHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="flex" style={{ minHeight: totalHeight }}>
        {/* Time label column */}
        <div className="w-[52px] shrink-0 select-none">
          {HOURS.map((h) => (
            <div
              key={h}
              className="flex items-start justify-end pr-2 pt-0.5 text-[10px] text-muted-foreground font-mono border-b border-border"
              style={{ height: HOUR_HEIGHT }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const today = isToday(day);
          const dayTasks = tasksForDay(tasks, day);

          return (
            <div
              key={day.toISOString()}
              className={`flex-1 relative border-l border-border ${
                today ? "bg-primary/[0.03]" : ""
              }`}
            >
              {/* Hour cells (grid lines + click target) */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSlotClick(day, h)}
                />
              ))}

              {/* Current time indicator — today only */}
              {today && nowPx >= 0 && nowPx <= totalHeight && (
                <div
                  className="absolute left-0 right-0 flex items-center pointer-events-none z-20"
                  style={{ top: nowPx }}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0" />
                  <div className="flex-1 h-[2px] bg-red-500 opacity-80" />
                </div>
              )}

              {/* Task blocks */}
              {dayTasks.map((task) => (
                <CalendarTaskBlock
                  key={task.id}
                  task={task}
                  topPx={calcTaskTop(task.due_time!)}
                  onClick={onTaskClick}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
