revoke all on public.itinerary_activity_tasks from anon, authenticated;
grant select, insert, delete on public.itinerary_activity_tasks to authenticated;
grant update (title, description, is_completed) on public.itinerary_activity_tasks to authenticated;
