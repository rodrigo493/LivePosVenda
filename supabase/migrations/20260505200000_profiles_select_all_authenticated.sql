-- Permite que todos os usuários autenticados vejam todos os perfis
-- Necessário para o seletor de Consultor/Vendedor em PA, PD, PG e Orçamento
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
