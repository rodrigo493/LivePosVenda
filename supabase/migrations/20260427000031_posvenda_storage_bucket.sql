-- =============================================================================
-- Storage bucket: posvenda-evidencias
-- Fotos, vídeos e PDFs de evidências de reparo
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posvenda-evidencias',
  'posvenda-evidencias',
  true,
  52428800,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Staff pode fazer upload
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'staff upload posvenda evidencias'
  ) THEN
    CREATE POLICY "staff upload posvenda evidencias"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'posvenda-evidencias'
        AND public.is_staff(auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'public read posvenda evidencias'
  ) THEN
    CREATE POLICY "public read posvenda evidencias"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'posvenda-evidencias');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'staff delete posvenda evidencias'
  ) THEN
    CREATE POLICY "staff delete posvenda evidencias"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'posvenda-evidencias'
        AND public.is_staff(auth.uid())
      );
  END IF;
END $$;
