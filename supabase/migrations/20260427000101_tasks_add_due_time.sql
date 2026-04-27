-- supabase/migrations/20260427000101_tasks_add_due_time.sql
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_time time;
