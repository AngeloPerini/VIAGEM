-- Per-user AI generation quotas.
-- Frontend can read the values to explain the limit, but only the backend
-- service role can consume quota through consume_ai_generation_quota().

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles
  add column if not exists ai_generations_used integer not null default 0,
  add column if not exists ai_generations_limit integer not null default 3,
  add column if not exists last_ai_generation_at timestamptz;

alter table public.profiles
  add constraint profiles_ai_generations_used_nonnegative check (ai_generations_used >= 0) not valid;

alter table public.profiles
  add constraint profiles_ai_generations_limit_nonnegative check (ai_generations_limit >= 0) not valid;

update public.profiles
set ai_generations_used = coalesce(ai_generations_used, 0),
    ai_generations_limit = coalesce(ai_generations_limit, 3);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ai_generations_used_nonnegative'
      and convalidated
  ) then
    alter table public.profiles validate constraint profiles_ai_generations_used_nonnegative;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_ai_generations_limit_nonnegative'
      and convalidated
  ) then
    alter table public.profiles validate constraint profiles_ai_generations_limit_nonnegative;
  end if;
end $$;

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
with check (id = (select auth.uid()));

create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

revoke all on public.profiles from anon;
revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, email, full_name, avatar_url, created_at, updated_at) on public.profiles to authenticated;
grant update (email, full_name, avatar_url, updated_at) on public.profiles to authenticated;

create or replace function public.consume_ai_generation_quota(target_user_id uuid)
returns table (
  allowed boolean,
  error_code text,
  message text,
  ai_generations_used integer,
  ai_generations_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_record public.profiles%rowtype;
begin
  if target_user_id is null then
    return query select false, 'UNAUTHENTICATED', 'Usuario nao autenticado.', 0, 3;
    return;
  end if;

  insert into public.profiles (id, ai_generations_used, ai_generations_limit, updated_at)
  values (target_user_id, 0, 3, now())
  on conflict (id) do nothing;

  select *
  into profile_record
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    return query select false, 'PROFILE_NOT_FOUND', 'Perfil nao encontrado.', 0, 3;
    return;
  end if;

  if coalesce(profile_record.ai_generations_used, 0) >= coalesce(profile_record.ai_generations_limit, 3) then
    return query select
      false,
      'AI_GENERATION_LIMIT_REACHED',
      'Você atingiu o limite gratuito de 3 gerações de viagem com IA.',
      coalesce(profile_record.ai_generations_used, 0),
      coalesce(profile_record.ai_generations_limit, 3);
    return;
  end if;

  if profile_record.last_ai_generation_at is not null
    and profile_record.last_ai_generation_at > now() - interval '30 seconds' then
    return query select
      false,
      'AI_GENERATION_COOLDOWN',
      'Aguarde alguns segundos antes de gerar novamente.',
      coalesce(profile_record.ai_generations_used, 0),
      coalesce(profile_record.ai_generations_limit, 3);
    return;
  end if;

  update public.profiles
  set ai_generations_used = coalesce(public.profiles.ai_generations_used, 0) + 1,
      ai_generations_limit = coalesce(public.profiles.ai_generations_limit, 3),
      last_ai_generation_at = now(),
      updated_at = now()
  where public.profiles.id = target_user_id
  returning * into profile_record;

  return query select
    true,
    null::text,
    null::text,
    profile_record.ai_generations_used,
    profile_record.ai_generations_limit;
end;
$$;

revoke execute on function public.consume_ai_generation_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_generation_quota(uuid) to service_role;
revoke execute on function public.can_view_profile(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile(uuid, uuid) to authenticated;
