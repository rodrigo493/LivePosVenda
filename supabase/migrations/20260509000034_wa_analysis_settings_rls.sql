alter table wa_analysis_settings enable row level security;

-- Apenas admin lê e edita as configurações de análise
create policy "wa_analysis_settings_admin" on wa_analysis_settings
  for all using (
    exists (
      select 1 from user_roles
      where user_id = auth.uid() and role = 'admin'::app_role
    )
  );
