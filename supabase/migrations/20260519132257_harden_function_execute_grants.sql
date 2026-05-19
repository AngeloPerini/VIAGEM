-- Harden public function execution after enabling group/auth helpers.
-- Supabase exposes public-schema RPCs through PostgREST, so revoke the default
-- PUBLIC execute grant and add back only the authenticated functions the app uses.

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.accept_group_invite(text) from public, anon;
revoke execute on function public.add_group_owner_member() from public, anon, authenticated;
revoke execute on function public.claim_legacy_trip_group(text, text) from public, anon;
revoke execute on function public.claim_owner_trip_group(text, text) from public, anon;
revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
revoke execute on function public.is_group_owner(uuid, uuid) from public, anon;
revoke execute on function public.try_parse_uuid(text) from public, anon;

do $$
begin
  if to_regprocedure('public.can_view_profile(uuid, uuid)') is not null then
    execute 'revoke execute on function public.can_view_profile(uuid, uuid) from public, anon';
  end if;

  if to_regprocedure('public.handle_auth_user_profile()') is not null then
    execute 'revoke execute on function public.handle_auth_user_profile() from public, anon, authenticated';
  end if;
end $$;

grant execute on function public.accept_group_invite(text) to authenticated;
grant execute on function public.claim_legacy_trip_group(text, text) to authenticated;
grant execute on function public.claim_owner_trip_group(text, text) to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.try_parse_uuid(text) to authenticated;

do $$
begin
  if to_regprocedure('public.can_view_profile(uuid, uuid)') is not null then
    execute 'grant execute on function public.can_view_profile(uuid, uuid) to authenticated';
  end if;
end $$;
