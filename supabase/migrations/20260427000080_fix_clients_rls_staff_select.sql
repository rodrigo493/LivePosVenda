-- Fix: clients SELECT was restricted to created_by only (migration 00050),
-- breaking WhatsApp conversations list and CRM card client names for non-admin users.
-- All staff need to read all clients for chat and pipeline to work.
-- Keep INSERT/UPDATE owner-based; restore SELECT to is_staff.

DROP POLICY IF EXISTS "clients_select_owner_or_admin" ON public.clients;

CREATE POLICY "clients_select_staff_or_owner" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    OR auth.uid() = created_by
  );
