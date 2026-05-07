-- Relay table: CRM grava aqui; extensão lê via Realtime e injeta no WA Web
CREATE TABLE IF NOT EXISTS public.whatsapp_pending_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.pipeline_whatsapp_instances(id),
  phone       text NOT NULL,
  message     text,
  status      text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  error       text,
  created_at  timestamptz DEFAULT now(),
  sent_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id)
);

ALTER TABLE public.whatsapp_pending_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own pending sends"
  ON public.whatsapp_pending_sends FOR SELECT
  TO authenticated
  USING (
    instance_id IN (
      SELECT id FROM public.pipeline_whatsapp_instances WHERE user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_pending_sends;
