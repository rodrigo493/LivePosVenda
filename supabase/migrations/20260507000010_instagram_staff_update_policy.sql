-- Permite staff atualizar unread_count em instagram_conversations
-- (mark-as-read ao clicar na conversa)
create policy "staff atualiza instagram_conversations"
  on public.instagram_conversations for update
  using (exists (select 1 from public.user_roles where user_id = auth.uid()))
  with check (exists (select 1 from public.user_roles where user_id = auth.uid()));
