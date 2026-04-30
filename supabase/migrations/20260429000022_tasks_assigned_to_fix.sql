-- Garante que assigned_to seja nullable e tenha default null
alter table public.tasks
  alter column assigned_to drop not null,
  alter column assigned_to set default null;
