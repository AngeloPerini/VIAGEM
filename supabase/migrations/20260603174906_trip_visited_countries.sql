create table if not exists public.trip_visited_countries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  country_name text not null,
  visited boolean not null default true,
  visited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_visited_countries_country_code_not_blank check (length(trim(country_code)) > 0),
  constraint trip_visited_countries_country_name_not_blank check (length(trim(country_name)) > 0),
  constraint trip_visited_countries_group_country_unique unique (group_id, country_code)
);

create index if not exists trip_visited_countries_group_id_idx
on public.trip_visited_countries(group_id);

create index if not exists trip_visited_countries_user_id_idx
on public.trip_visited_countries(user_id);

create index if not exists trip_visited_countries_recent_idx
on public.trip_visited_countries(group_id, visited_at desc)
where visited is true;

drop trigger if exists update_trip_visited_countries_updated_at on public.trip_visited_countries;
create trigger update_trip_visited_countries_updated_at
before update on public.trip_visited_countries
for each row execute function public.update_updated_at_column();

alter table public.trip_visited_countries enable row level security;

drop policy if exists "Members can view trip visited countries" on public.trip_visited_countries;
create policy "Members can view trip visited countries"
on public.trip_visited_countries for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "Members can create trip visited countries" on public.trip_visited_countries;
create policy "Members can create trip visited countries"
on public.trip_visited_countries for insert
to authenticated
with check (
  public.is_group_member(group_id)
  and user_id = (select auth.uid())
);

drop policy if exists "Members can update trip visited countries" on public.trip_visited_countries;
create policy "Members can update trip visited countries"
on public.trip_visited_countries for update
to authenticated
using (public.is_group_member(group_id))
with check (
  public.is_group_member(group_id)
  and user_id = (select auth.uid())
);

drop policy if exists "Members can delete trip visited countries" on public.trip_visited_countries;
create policy "Members can delete trip visited countries"
on public.trip_visited_countries for delete
to authenticated
using (public.is_group_member(group_id));

grant select, insert, delete on public.trip_visited_countries to authenticated;
grant update (user_id, country_name, visited, visited_at) on public.trip_visited_countries to authenticated;
revoke all on public.trip_visited_countries from anon;

alter table public.trip_visited_countries replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trip_visited_countries'
    )
  then
    alter publication supabase_realtime add table public.trip_visited_countries;
  end if;
end $$;
