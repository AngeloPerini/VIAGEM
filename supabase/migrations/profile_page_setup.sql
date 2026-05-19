-- Profile page support: user profiles, profile visibility, and safer member removal.
-- Run after groups_auth_setup.sql.

create extension if not exists pgcrypto;

-- Keep this file idempotent for SQL Editor re-runs.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  ai_generations_used integer not null default 0,
  ai_generations_limit integer not null default 3,
  last_ai_generation_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles
  add column if not exists ai_generations_used integer not null default 0,
  add column if not exists ai_generations_limit integer not null default 3,
  add column if not exists last_ai_generation_at timestamptz;

-- Extra planning fields for trips created by users after login.
alter table public.travel_groups
  add column if not exists countries text[] default '{}',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists travel_style text,
  add column if not exists notes text;

create index if not exists profiles_email_idx on public.profiles(lower(email));

drop trigger if exists update_profiles_updated_at on public.profiles;
create trigger update_profiles_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

-- Profiles are populated from Google/email auth metadata and kept fresh on later login updates.
create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_changed on auth.users;
create trigger on_auth_user_profile_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user_profile();

-- Backfill existing users without exposing auth.users to the frontend.
insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
select
  auth_user.id,
  auth_user.email,
  coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name'),
  coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', auth_user.raw_user_meta_data ->> 'picture'),
  coalesce(auth_user.created_at, now()),
  now()
from auth.users auth_user
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
      updated_at = now();

-- SECURITY DEFINER helper avoids recursive policy checks while still limiting profile visibility.
create or replace function public.can_view_profile(target_user_id uuid, viewer_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id is not null
    and viewer_user_id is not null
    and (
      target_user_id = viewer_user_id
      or exists (
        select 1
        from public.group_members target_member
        join public.group_members viewer_member
          on viewer_member.group_id = target_member.group_id
        where target_member.user_id = target_user_id
          and viewer_member.user_id = viewer_user_id
      )
    );
$$;

-- Keep profile data available when a user joins by invite before opening the Profile page.
create or replace function public.accept_group_invite(invite_token text)
returns table (
  id uuid,
  name text,
  description text,
  owner_id uuid,
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
  target_invite public.group_invites%rowtype;
  normalized_token text := upper(trim(invite_token));
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at)
  select
    auth_user.id,
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name'),
    coalesce(auth_user.raw_user_meta_data ->> 'avatar_url', auth_user.raw_user_meta_data ->> 'picture'),
    coalesce(auth_user.created_at, now()),
    now()
  from auth.users auth_user
  where auth_user.id = current_user_id
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now();

  select *
  into target_invite
  from public.group_invites
  where upper(token) = normalized_token
    and (single_use is false or used is false)
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'Convite invalido ou expirado.';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_invite.group_id, current_user_id, target_invite.role)
  on conflict (group_id, user_id) do update
    set role = case
      when public.group_members.role = 'owner' then public.group_members.role
      else excluded.role
    end;

  update public.group_invites
  set used_count = coalesce(used_count, 0) + 1,
      used = case when target_invite.single_use then true else false end
  where public.group_invites.id = target_invite.id;

  return query
  select travel_group.id,
    travel_group.name,
    travel_group.description,
    travel_group.owner_id,
    travel_group.created_at,
    travel_group.updated_at,
    member.role
  from public.travel_groups travel_group
  join public.group_members member
    on member.group_id = travel_group.id
   and member.user_id = current_user_id
  where travel_group.id = target_invite.group_id;
end;
$$;

revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, full_name, avatar_url, created_at, updated_at) on public.profiles to authenticated;
grant update (email, full_name, avatar_url, updated_at) on public.profiles to authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
grant execute on function public.handle_auth_user_profile() to authenticated;
grant execute on function public.accept_group_invite(text) to authenticated;
revoke all on public.profiles from anon;

alter table public.profiles enable row level security;

drop policy if exists "Members can view related profiles" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Members can view related profiles"
on public.profiles for select
to authenticated
using (public.can_view_profile(id));

create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Harden member removal: owners can remove members, never themselves or another owner.
drop policy if exists "Owners can delete group members" on public.group_members;
create policy "Owners can delete group members"
on public.group_members for delete
to authenticated
using (
  public.is_group_owner(group_id)
  and role <> 'owner'
  and user_id <> auth.uid()
);
