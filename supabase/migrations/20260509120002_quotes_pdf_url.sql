-- Armazena URL do PDF do orçamento para envio pela extensão WhatsApp
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pdf_url TEXT;
