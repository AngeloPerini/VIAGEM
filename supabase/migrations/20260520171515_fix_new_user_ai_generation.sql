-- Make the first-trip AI flow resilient for freshly-created auth users.
-- The frontend can ask the database to ensure the profile and create the
-- travel group plus owner membership in a single security-definer transaction.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists ai_generations_used integer default 0,
  add column if not exists ai_generations_limit integer default 3,
  add column if not exists last_ai_generation_at timestamptz;

alter table public.profiles
  alter column ai_generations_used set default 0,
  alter column ai_generations_limit set default 3;

update public.profiles
set ai_generations_used = coalesce(ai_generations_used, 0),
    ai_generations_limit = coalesce(ai_generations_limit, 3)
where ai_generations_used is null
   or ai_generations_limit is null;

alter table public.profiles
  alter column ai_generations_used set not null,
  alter column ai_generations_limit set not null;

alter table public.travel_groups
  add column if not exists countries text[] default '{}',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists travel_style text,
  add column if not exists notes text,
  add column if not exists status text default 'planned';

alter table public.travel_groups
  alter column countries set default '{}',
  alter column status set default 'planned';

create or replace function public.ensure_current_user_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_record public.profiles%rowtype;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    ai_generations_used,
    ai_generations_limit,
    last_ai_generation_at,
    created_at,
    updated_at
  )
  select
    auth_user.id,
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name'),
    coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', auth_user.raw_user_meta_data ->> 'picture'),
    0,
    3,
    null,
    coalesce(auth_user.created_at, now()),
    now()
  from auth.users auth_user
  where auth_user.id = current_user_id
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        ai_generations_used = coalesce(public.profiles.ai_generations_used, 0),
        ai_generations_limit = coalesce(public.profiles.ai_generations_limit, 3),
        updated_at = now()
  returning * into profile_record;

  if profile_record.id is null then
    raise exception 'Perfil nao encontrado para o usuario autenticado.' using errcode = 'P0002';
  end if;

  return profile_record;
end;
$$;

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    ai_generations_used,
    ai_generations_limit,
    last_ai_generation_at,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    0,
    3,
    null,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        ai_generations_used = coalesce(public.profiles.ai_generations_used, 0),
        ai_generations_limit = coalesce(public.profiles.ai_generations_limit, 3),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_changed on auth.users;
create trigger on_auth_user_profile_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user_profile();

insert into public.profiles (
  id,
  email,
  full_name,
  avatar_url,
  ai_generations_used,
  ai_generations_limit,
  last_ai_generation_at,
  created_at,
  updated_at
)
select
  auth_user.id,
  auth_user.email,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name'),
  coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', auth_user.raw_user_meta_data ->> 'picture'),
  0,
  3,
  null,
  coalesce(auth_user.created_at, now()),
  now()
from auth.users auth_user
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      ai_generations_used = coalesce(public.profiles.ai_generations_used, 0),
      ai_generations_limit = coalesce(public.profiles.ai_generations_limit, 3),
      updated_at = now();

drop policy if exists "Users can add themselves as group owner" on public.group_members;
create policy "Users can add themselves as group owner"
on public.group_members for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'owner'
  and public.is_group_owner(group_id)
);

create or replace function public.create_travel_group_with_owner(
  group_name text,
  group_description text default null,
  group_countries text[] default '{}',
  group_start_date date default null,
  group_end_date date default null,
  group_travel_style text default null,
  group_notes text default null
)
returns table (
  id uuid,
  name text,
  description text,
  owner_id uuid,
  status text,
  countries text[],
  start_date date,
  end_date date,
  travel_style text,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_group public.travel_groups%rowtype;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  if nullif(trim(group_name), '') is null then
    raise exception 'Informe o nome da viagem.' using errcode = '22023';
  end if;

  perform public.ensure_current_user_profile();

  insert into public.travel_groups (
    name,
    description,
    owner_id,
    status,
    countries,
    start_date,
    end_date,
    travel_style,
    notes
  )
  values (
    trim(group_name),
    nullif(trim(coalesce(group_description, '')), ''),
    current_user_id,
    'planned',
    coalesce(group_countries, '{}'),
    group_start_date,
    group_end_date,
    nullif(trim(coalesce(group_travel_style, '')), ''),
    nullif(trim(coalesce(group_notes, '')), '')
  )
  returning * into created_group;

  insert into public.group_members (group_id, user_id, role)
  values (created_group.id, current_user_id, 'owner')
  on conflict (group_id, user_id) do update
    set role = 'owner';

  return query
  select
    created_group.id,
    created_group.name,
    created_group.description,
    created_group.owner_id,
    coalesce(created_group.status, 'planned'),
    coalesce(created_group.countries, '{}'),
    created_group.start_date,
    created_group.end_date,
    created_group.travel_style,
    created_group.notes,
    created_group.created_at,
    created_group.updated_at,
    'owner'::text;
end;
$$;

revoke execute on function public.ensure_current_user_profile() from public, anon;
grant execute on function public.ensure_current_user_profile() to authenticated;

revoke execute on function public.create_travel_group_with_owner(text, text, text[], date, date, text, text) from public, anon;
grant execute on function public.create_travel_group_with_owner(text, text, text[], date, date, text, text) to authenticated;

revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, full_name, avatar_url, created_at, updated_at) on public.profiles to authenticated;
grant update (email, full_name, avatar_url, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.travel_groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update on public.ai_trip_generations to authenticated;
