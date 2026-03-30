-- Table for WhatsApp conversation messages
CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  message_text text NOT NULL,
  sender_name text,
  sender_phone text,
  manychat_subscriber_id text,
  manychat_message_id text,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff can insert messages" ON public.whatsapp_messages
  FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Webhook can insert messages" ON public.whatsapp_messages
  FOR INSERT TO anon
  WITH CHECK (direction = 'inbound');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;

-- Index for fast lookups
CREATE INDEX idx_whatsapp_messages_client ON public.whatsapp_messages(client_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_ticket ON public.whatsapp_messages(ticket_id, created_at DESC);