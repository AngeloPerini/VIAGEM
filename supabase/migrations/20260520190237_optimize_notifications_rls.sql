-- Keep notification access scoped to the signed-in user while avoiding
-- per-row auth.uid() re-evaluation in Supabase's RLS planner.

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
on public.notifications for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
on public.notifications for delete
to authenticated
using (user_id = (select auth.uid()));

revoke execute on function public.notification_actor_name(uuid) from public, anon, authenticated;
