-- Remove unique constraint absoluta em serial_number
-- Substitui por índice parcial: só aplica unicidade quando série não é vazia/nula
ALTER TABLE public.equipments DROP CONSTRAINT IF EXISTS equipments_serial_number_key;

-- Índice parcial: unicidade apenas para números de série preenchidos
CREATE UNIQUE INDEX IF NOT EXISTS idx_equipments_serial_unique
  ON public.equipments(serial_number)
  WHERE serial_number IS NOT NULL AND serial_number != '';

-- Normaliza registros existentes com série vazia para NULL
UPDATE public.equipments SET serial_number = NULL WHERE serial_number = '';

-- Garante que o default seja NULL (não string vazia)
ALTER TABLE public.equipments ALTER COLUMN serial_number SET DEFAULT NULL;
