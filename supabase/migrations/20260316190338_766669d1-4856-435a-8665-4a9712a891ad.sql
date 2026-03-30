
-- Add new columns to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS secondary_code text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS product_type text,
  ADD COLUMN IF NOT EXISTS product_group text,
  ADD COLUMN IF NOT EXISTS family text,
  ADD COLUMN IF NOT EXISTS suggested_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_current integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_minimum integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Create import_logs table
CREATE TABLE IF NOT EXISTS public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  file_name text NOT NULL,
  total_rows integer DEFAULT 0,
  imported_rows integer DEFAULT 0,
  updated_rows integer DEFAULT 0,
  skipped_rows integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed'
);

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view import logs" ON public.import_logs
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert import logs" ON public.import_logs
  FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));
