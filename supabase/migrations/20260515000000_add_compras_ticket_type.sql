-- Adiciona o valor 'compras' ao enum ticket_type_enum.
-- A opção "Compras" foi adicionada na UI (commit 6d76c22) sem a migration correspondente,
-- causando erro ao salvar tickets com esse tipo.
ALTER TYPE public.ticket_type_enum ADD VALUE IF NOT EXISTS 'compras';
