-- Adiciona coluna de funções do usuário no sistema (vendedor, pré-vendedor, etc.)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS job_functions TEXT[] NOT NULL DEFAULT '{}';
