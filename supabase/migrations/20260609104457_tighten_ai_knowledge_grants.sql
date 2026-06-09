-- Remove default broad table privileges from AI reference content tables.
-- Authenticated users only need read access to general destination knowledge.

revoke all on public.ai_destinations from anon, authenticated;
revoke all on public.ai_attractions from anon, authenticated;
revoke all on public.ai_transport_tips from anon, authenticated;
revoke all on public.ai_travel_documents from anon, authenticated;
revoke all on public.ai_generation_logs from anon, authenticated;

grant select on public.ai_destinations to authenticated;
grant select on public.ai_attractions to authenticated;
grant select on public.ai_transport_tips to authenticated;
grant select on public.ai_travel_documents to authenticated;

grant select, insert, update, delete on public.ai_destinations to service_role;
grant select, insert, update, delete on public.ai_attractions to service_role;
grant select, insert, update, delete on public.ai_transport_tips to service_role;
grant select, insert, update, delete on public.ai_travel_documents to service_role;
grant select, insert, update, delete on public.ai_generation_logs to service_role;
