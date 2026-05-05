-- Adiciona campo avatar_url à tabela clients para armazenar foto de perfil do WhatsApp
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS avatar_url TEXT;
