-- supabase/migrations/20260511200001_add_vendido_ticket_status.sql
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'vendido';
