-- Tasks importadas do RD Station não possuem usuário local correspondente.
-- Remove a constraint NOT NULL para permitir tarefas sem responsável definido.
ALTER TABLE public.tasks ALTER COLUMN assigned_to DROP NOT NULL;
