-- Adiciona tipo "negociacao" ao enum ticket_type_enum (para deals vindos do RD Station CRM)
ALTER TYPE public.ticket_type_enum ADD VALUE IF NOT EXISTS 'negociacao';
