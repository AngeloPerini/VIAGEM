-- The Edge Function uses the backend service role to maintain quota counters
-- and generation logs. These grants are not available to browser clients.

grant usage on schema public to service_role;
grant select, insert, update on public.profiles to service_role;
grant select, insert, update on public.ai_trip_generations to service_role;
grant execute on function public.consume_ai_generation_quota(uuid) to service_role;
