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
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

grant select, insert, update on public.profiles to authenticated;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
grant execute on function public.handle_auth_user_profile() to authenticated;
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
