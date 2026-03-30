
-- Fix permissive RLS policy on activity_logs
DROP POLICY IF EXISTS "Anyone can insert activity logs" ON public.activity_logs;
CREATE POLICY "Users can insert own activity logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = performed_by);
