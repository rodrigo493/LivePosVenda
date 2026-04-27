-- supabase/migrations/20260427000050_crm_module_permissions.sql

-- 1. Tabela de permissões de módulos CRM por usuário
CREATE TABLE public.crm_module_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_key)
);
ALTER TABLE public.crm_module_permissions ENABLE ROW LEVEL SECURITY;

-- Admins podem ler/escrever tudo; usuários leem apenas as próprias
CREATE POLICY "crm_perms_admin_all" ON public.crm_module_permissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "crm_perms_user_select" ON public.crm_module_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2. Adicionar created_by à tabela clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 3. RLS para clients: usuário vê seus clientes; admin vê todos; legados (null) visíveis a todos
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;

CREATE POLICY "clients_select_owner_or_admin" ON public.clients
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR created_by IS NULL
    OR auth.uid() = created_by
  );

-- 4. RLS insert: obriga created_by = auth.uid()
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;

CREATE POLICY "clients_insert_owner" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
