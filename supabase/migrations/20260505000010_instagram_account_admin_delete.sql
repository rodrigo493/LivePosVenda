create policy "admin deleta instagram_account"
  on public.instagram_account for delete
  using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));
