-- Corrige policies de INSERT/UPDATE que restringiam a admin+atendimento,
-- bloqueando outros usuários staff (vendedor, tecnico, etc.) na extensão WhatsApp.
-- is_staff() = qualquer role != 'cliente'

-- clients: INSERT e UPDATE
DROP POLICY IF EXISTS "Staff can insert clients" ON public.clients;
CREATE POLICY "Staff can insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can update clients" ON public.clients;
CREATE POLICY "Staff can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()));

-- client_service_history: INSERT
DROP POLICY IF EXISTS "Staff can insert client history" ON public.client_service_history;
CREATE POLICY "Staff can insert client history" ON public.client_service_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
