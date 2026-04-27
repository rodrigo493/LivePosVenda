-- supabase/migrations/20260427000052_crm_clients_rls_fixup.sql
-- Fix: drop remaining old clients RLS policies that weren't removed in 00050

-- Drop old staff-role policies that coexist with new owner-based policies
DROP POLICY IF EXISTS "Staff can view clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Staff can update clients" ON public.clients;
DROP POLICY IF EXISTS "Admin can delete clients" ON public.clients;

-- Add owner-based UPDATE policy (non-admins can only update their own clients)
CREATE POLICY "clients_update_owner_or_admin" ON public.clients
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR auth.uid() = created_by
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR auth.uid() = created_by
  );

-- Retain admin delete capability
CREATE POLICY "clients_delete_admin" ON public.clients
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-set created_by = auth.uid() if not provided on INSERT
-- This makes the INSERT policy self-healing (app doesn't have to remember to set the field)
CREATE OR REPLACE FUNCTION public.set_clients_created_by()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_set_created_by ON public.clients;
CREATE TRIGGER clients_set_created_by
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_clients_created_by();
