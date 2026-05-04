-- Migration: bucket problemas-producao para anexos de problemas de produção

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'problemas-producao',
  'problemas-producao',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'staff upload problemas-producao'
  ) THEN
    CREATE POLICY "staff upload problemas-producao"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'problemas-producao'
        AND public.is_staff(auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'public read problemas-producao'
  ) THEN
    CREATE POLICY "public read problemas-producao"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'problemas-producao');
  END IF;
END $$;
