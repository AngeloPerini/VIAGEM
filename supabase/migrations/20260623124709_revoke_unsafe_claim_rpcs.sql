-- P0 containment: these legacy SECURITY DEFINER claim functions must never be
-- reachable through the Data API. Administrative recovery remains possible
-- only through a direct privileged database connection owned by the operator.

revoke execute on function public.claim_owner_trip_group(text, text)
from public, anon, authenticated, service_role;

revoke execute on function public.claim_legacy_trip_group(text, text)
from public, anon, authenticated, service_role;

do $$
declare
  unsafe_function regprocedure;
  blocked_role name;
begin
  foreach unsafe_function in array array[
    'public.claim_owner_trip_group(text,text)'::regprocedure,
    'public.claim_legacy_trip_group(text,text)'::regprocedure
  ]
  loop
    foreach blocked_role in array array['anon'::name, 'authenticated'::name, 'service_role'::name]
    loop
      if has_function_privilege(blocked_role, unsafe_function, 'EXECUTE') then
        raise exception 'P0 containment failed: role % can still execute %',
          blocked_role,
          unsafe_function;
      end if;
    end loop;
  end loop;
end;
$$;
