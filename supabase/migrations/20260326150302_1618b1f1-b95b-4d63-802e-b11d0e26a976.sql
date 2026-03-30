ALTER TABLE public.equipments ALTER COLUMN serial_number DROP NOT NULL;
ALTER TABLE public.equipments ALTER COLUMN serial_number SET DEFAULT '';