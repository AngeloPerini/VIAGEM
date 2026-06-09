create table if not exists public.user_visited_countries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  country_name text not null,
  visited_at timestamptz not null default now(),
  source text,
  source_group_id uuid references public.travel_groups(id) on delete set null,
  source_trip_id uuid references public.travel_groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_visited_countries_country_code_not_blank check (length(trim(country_code)) > 0),
  constraint user_visited_countries_country_name_not_blank check (length(trim(country_name)) > 0),
  constraint user_visited_countries_user_country_unique unique (user_id, country_code)
);

alter table public.user_visited_countries
  add column if not exists source text,
  add column if not exists source_group_id uuid references public.travel_groups(id) on delete set null,
  add column if not exists source_trip_id uuid references public.travel_groups(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_visited_countries_user_country_unique'
      and conrelid = 'public.user_visited_countries'::regclass
  ) then
    alter table public.user_visited_countries
    add constraint user_visited_countries_user_country_unique unique (user_id, country_code);
  end if;
end $$;

create index if not exists user_visited_countries_user_id_idx
on public.user_visited_countries(user_id);

create index if not exists user_visited_countries_recent_idx
on public.user_visited_countries(user_id, visited_at desc);

create index if not exists user_visited_countries_source_group_id_idx
on public.user_visited_countries(source_group_id)
where source_group_id is not null;

drop trigger if exists update_user_visited_countries_updated_at on public.user_visited_countries;
create trigger update_user_visited_countries_updated_at
before update on public.user_visited_countries
for each row execute function public.update_updated_at_column();

alter table public.user_visited_countries enable row level security;

drop policy if exists "Users can view their visited countries" on public.user_visited_countries;
create policy "Users can view their visited countries"
on public.user_visited_countries for select
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Users can create their visited countries" on public.user_visited_countries;
create policy "Users can create their visited countries"
on public.user_visited_countries for insert
to authenticated
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Users can update their visited countries" on public.user_visited_countries;
create policy "Users can update their visited countries"
on public.user_visited_countries for update
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "Users can delete their visited countries" on public.user_visited_countries;
create policy "Users can delete their visited countries"
on public.user_visited_countries for delete
to authenticated
using ((select auth.uid()) is not null and user_id = (select auth.uid()));

revoke all on public.user_visited_countries from public, anon;
grant select, insert, update, delete on public.user_visited_countries to authenticated;

alter table public.user_visited_countries replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_visited_countries'
    )
  then
    alter publication supabase_realtime add table public.user_visited_countries;
  end if;
end $$;

create or replace function pg_temp.normalize_visited_country_code(raw_country text)
returns text
language sql
immutable
as $$
  with normalized as (
    select regexp_replace(
      translate(
        lower(trim(coalesce(raw_country, ''))),
        'áàâãäåéèêëíìîïóòôõöúùûüçñ',
        'aaaaaaeeeeiiiiooooouuuucn'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    ) as value
  )
  select case
    when value in ('brasil', 'brazil', 'br', 'bra', '076', '76') then 'BRA'
    when value in ('italia', 'italy', 'it', 'ita', '380') then 'ITA'
    when value in ('franca', 'france', 'fr', 'fra', '250') then 'FRA'
    when value in ('suica', 'switzerland', 'swiss', 'ch', 'che', '756') then 'CHE'
    when value in ('japao', 'japan', 'jp', 'jpn', '392') then 'JPN'
    when value in (
      'reino_unido',
      'united_kingdom',
      'great_britain',
      'gra_bretanha',
      'britain',
      'uk',
      'gb',
      'gbr',
      'inglaterra',
      'england',
      'escocia',
      'scotland',
      '826'
    ) then 'GBR'
    when value in ('espanha', 'spain', 'es', 'esp', '724') then 'ESP'
    when value in ('portugal', 'pt', 'prt', '620') then 'PRT'
    when value in ('alemanha', 'germany', 'de', 'deu', '276') then 'DEU'
    when value in ('paises_baixos', 'netherlands', 'nl', 'nld', '528') then 'NLD'
    when value in ('all', 'todos', 'international', 'internacional') then ''
    when length(value) = 3 then upper(value)
    else upper(value)
  end
  from normalized;
$$;

create or replace function pg_temp.visited_country_name(country_code text, fallback_name text)
returns text
language sql
immutable
as $$
  select case upper(trim(coalesce(country_code, '')))
    when 'BRA' then 'Brasil'
    when 'ITA' then 'Itália'
    when 'FRA' then 'França'
    when 'CHE' then 'Suíça'
    when 'JPN' then 'Japão'
    when 'GBR' then 'Reino Unido'
    when 'ESP' then 'Espanha'
    when 'PRT' then 'Portugal'
    when 'DEU' then 'Alemanha'
    when 'NLD' then 'Países Baixos'
    else coalesce(nullif(trim(fallback_name), ''), upper(trim(country_code)))
  end;
$$;

with legacy_visited_countries as (
  select distinct on (legacy.user_id, normalized.country_code)
    legacy.user_id,
    normalized.country_code,
    pg_temp.visited_country_name(normalized.country_code, legacy.country_name) as country_name,
    coalesce(legacy.visited_at, legacy.updated_at, legacy.created_at, now()) as visited_at,
    legacy.group_id as source_group_id,
    legacy.group_id as source_trip_id
  from public.trip_visited_countries legacy
  cross join lateral (
    select pg_temp.normalize_visited_country_code(coalesce(legacy.country_code, legacy.country_name)) as country_code
  ) normalized
  where legacy.visited is true
    and legacy.user_id is not null
    and length(normalized.country_code) > 0
  order by
    legacy.user_id,
    normalized.country_code,
    coalesce(legacy.visited_at, legacy.updated_at, legacy.created_at, now()) desc
)
insert into public.user_visited_countries (
  user_id,
  country_code,
  country_name,
  visited_at,
  source,
  source_group_id,
  source_trip_id
)
select
  user_id,
  country_code,
  country_name,
  visited_at,
  'migration',
  source_group_id,
  source_trip_id
from legacy_visited_countries
on conflict (user_id, country_code) do update
set
  country_name = coalesce(nullif(public.user_visited_countries.country_name, ''), excluded.country_name),
  source = coalesce(public.user_visited_countries.source, excluded.source),
  source_group_id = coalesce(public.user_visited_countries.source_group_id, excluded.source_group_id),
  source_trip_id = coalesce(public.user_visited_countries.source_trip_id, excluded.source_trip_id),
  updated_at = now();
