-- Permite client_id nulo em tickets para acomodar deals do RD Station CRM
-- que podem chegar sem contato vinculado no momento da criação.
-- A constraint de FK é mantida (quando preenchido, deve existir em clients).
ALTER TABLE public.tickets
  ALTER COLUMN client_id DROP NOT NULL;
