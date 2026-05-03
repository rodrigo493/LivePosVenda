-- Fixup: missing grants, admin-only write policies, index, and view cleanup

-- 1. Grant DML on base tables (PostgREST requires explicit table grants in addition to RLS)
GRANT SELECT, INSERT, UPDATE ON public.loss_reasons TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.ticket_loss_reasons TO authenticated;

-- 2. Drop overly-permissive write policies and replace with admin-only
DROP POLICY IF EXISTS "loss_reasons_insert" ON public.loss_reasons;
DROP POLICY IF EXISTS "loss_reasons_update" ON public.loss_reasons;

CREATE POLICY "loss_reasons_insert" ON public.loss_reasons
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "loss_reasons_update" ON public.loss_reasons
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Index on loss_reason_id for view JOIN performance
CREATE INDEX IF NOT EXISTS ticket_loss_reasons_loss_reason_id_idx
  ON public.ticket_loss_reasons (loss_reason_id);

-- 4. Recreate view (drop first to allow column-type changes if any)
DROP VIEW IF EXISTS public.loss_reasons_with_count;

CREATE VIEW public.loss_reasons_with_count AS
SELECT
  lr.id,
  lr.label,
  lr.active,
  lr.position,
  lr.created_at,
  COUNT(tlr.ticket_id)::INTEGER AS ticket_count
FROM public.loss_reasons lr
LEFT JOIN public.ticket_loss_reasons tlr ON lr.id = tlr.loss_reason_id
GROUP BY lr.id;
