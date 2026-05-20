-- Email-bound trip invites: owners can send invites, invited users can see
-- pending invitations on their profile and accept/reject only their own email.

create extension if not exists pgcrypto;

alter table public.group_invites
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists single_use boolean not null default true,
  add column if not exists used_count int not null default 0;

alter table public.group_invites
  alter column role set default 'member',
  alter column used set default false,
  alter column created_at set default now();

create index if not exists group_invites_email_idx
on public.group_invites(lower(trim(email)));

create index if not exists group_invites_pending_email_idx
on public.group_invites(lower(trim(email)), used, rejected_at);

create or replace function public.current_auth_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(auth_user.email)
  from auth.users auth_user
  where auth_user.id = auth.uid();
$$;

create or replace function public.prevent_duplicate_active_group_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(new.email));
begin
  if new.email is not null then
    new.email := normalized_email;
  end if;

  if normalized_email is null
    or normalized_email = ''
    or coalesce(new.used, false) is true
    or new.rejected_at is not null
    or (new.expires_at is not null and new.expires_at <= now()) then
    return new;
  end if;

  if exists (
    select 1
    from public.group_invites existing_invite
    where existing_invite.group_id = new.group_id
      and existing_invite.id <> new.id
      and lower(trim(existing_invite.email)) = normalized_email
      and coalesce(existing_invite.used, false) is false
      and existing_invite.rejected_at is null
      and (existing_invite.expires_at is null or existing_invite.expires_at > now())
  ) then
    raise exception 'Ja existe um convite pendente para este e-mail nesta viagem.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_group_invites_trigger on public.group_invites;
create trigger prevent_duplicate_active_group_invites_trigger
before insert or update of group_id, email, used, rejected_at, expires_at
on public.group_invites
for each row execute function public.prevent_duplicate_active_group_invites();

create or replace function public.create_group_invite(
  target_group_id uuid,
  invite_email text,
  invite_token text,
  invite_role text default 'member',
  invite_expires_at timestamptz default now() + interval '7 days'
)
returns table (
  id uuid,
  group_id uuid,
  email text,
  token text,
  role text,
  used boolean,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(trim(invite_email));
  normalized_token text := upper(trim(invite_token));
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  if not public.is_group_owner(target_group_id, current_user_id) then
    raise exception 'Apenas o owner pode convidar pessoas para esta viagem.' using errcode = '42501';
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Informe o e-mail do convidado.' using errcode = '22023';
  end if;

  if normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Informe um e-mail valido.' using errcode = '22023';
  end if;

  if normalized_token is null or normalized_token = '' then
    raise exception 'Token de convite invalido.' using errcode = '22023';
  end if;

  if invite_role not in ('owner', 'member') then
    raise exception 'Papel do convite invalido.' using errcode = '22023';
  end if;

  insert into public.group_invites (
    group_id,
    email,
    token,
    role,
    used,
    single_use,
    used_count,
    accepted_at,
    rejected_at,
    expires_at,
    created_by
  )
  values (
    target_group_id,
    normalized_email,
    normalized_token,
    invite_role,
    false,
    true,
    0,
    null,
    null,
    coalesce(invite_expires_at, now() + interval '7 days'),
    current_user_id
  )
  returning
    public.group_invites.id,
    public.group_invites.group_id,
    public.group_invites.email,
    public.group_invites.token,
    public.group_invites.role,
    public.group_invites.used,
    public.group_invites.expires_at,
    public.group_invites.created_by,
    public.group_invites.created_at
  into id, group_id, email, token, role, used, expires_at, created_by, created_at;

  return next;
end;
$$;

create or replace function public.get_pending_group_invites()
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_description text,
  token text,
  email text,
  role text,
  expires_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  inviter_name text,
  inviter_email text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := public.current_auth_email();
begin
  if current_email is null or current_email = '' then
    return;
  end if;

  return query
  select
    invite.id,
    invite.group_id,
    travel_group.name,
    travel_group.description,
    invite.token,
    invite.email,
    invite.role,
    invite.expires_at,
    invite.created_at,
    invite.created_by,
    coalesce(inviter.full_name, inviter.email, 'TripFlow') as inviter_name,
    inviter.email as inviter_email
  from public.group_invites invite
  join public.travel_groups travel_group
    on travel_group.id = invite.group_id
  left join public.profiles inviter
    on inviter.id = invite.created_by
  where invite.email is not null
    and lower(trim(invite.email)) = current_email
    and coalesce(invite.used, false) is false
    and invite.rejected_at is null
    and invite.accepted_at is null
    and (invite.expires_at is null or invite.expires_at > now())
  order by invite.created_at desc;
end;
$$;

drop function if exists public.accept_group_invite(text);

create function public.accept_group_invite(invite_token text)
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
  current_email text := public.current_auth_email();
  target_invite public.group_invites%rowtype;
  normalized_token text := upper(trim(invite_token));
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  perform public.ensure_current_user_profile();

  select *
  into target_invite
  from public.group_invites
  where upper(token) = normalized_token
  for update;

  if not found then
    raise exception 'Convite invalido ou expirado.' using errcode = 'P0002';
  end if;

  if coalesce(target_invite.used, false) is true
    or target_invite.accepted_at is not null
    or target_invite.rejected_at is not null
    or (target_invite.expires_at is not null and target_invite.expires_at <= now()) then
    raise exception 'Convite invalido ou expirado.' using errcode = 'P0002';
  end if;

  if target_invite.email is not null
    and lower(trim(target_invite.email)) <> coalesce(current_email, '') then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (target_invite.group_id, current_user_id, coalesce(target_invite.role, 'member'))
  on conflict (group_id, user_id) do update
    set role = case
      when public.group_members.role = 'owner' then public.group_members.role
      else excluded.role
    end;

  update public.group_invites
  set used_count = coalesce(used_count, 0) + 1,
      used = true,
      accepted_at = now()
  where public.group_invites.id = target_invite.id;

  return query
  select travel_group.id,
    travel_group.name,
    travel_group.description,
    coalesce(travel_group.owner_id, target_invite.created_by),
    coalesce(travel_group.status, 'planned'),
    coalesce(travel_group.countries, '{}'),
    travel_group.start_date,
    travel_group.end_date,
    travel_group.travel_style,
    travel_group.notes,
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

create or replace function public.reject_group_invite(invite_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := public.current_auth_email();
  target_invite public.group_invites%rowtype;
  normalized_token text := upper(trim(invite_token));
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  select *
  into target_invite
  from public.group_invites
  where upper(token) = normalized_token
  for update;

  if not found then
    raise exception 'Convite invalido ou expirado.' using errcode = 'P0002';
  end if;

  if coalesce(target_invite.used, false) is true
    or target_invite.accepted_at is not null
    or target_invite.rejected_at is not null
    or (target_invite.expires_at is not null and target_invite.expires_at <= now()) then
    raise exception 'Convite invalido ou expirado.' using errcode = 'P0002';
  end if;

  if target_invite.email is not null
    and lower(trim(target_invite.email)) <> coalesce(current_email, '') then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;

  update public.group_invites
  set rejected_at = now()
  where id = target_invite.id;

  return true;
end;
$$;

alter table public.group_invites enable row level security;

drop policy if exists "Invitees can view own pending invites" on public.group_invites;
create policy "Invitees can view own pending invites"
on public.group_invites for select
to authenticated
using (
  email is not null
  and lower(trim(email)) = public.current_auth_email()
  and coalesce(used, false) is false
  and rejected_at is null
  and accepted_at is null
  and (expires_at is null or expires_at > now())
);

drop policy if exists "Authenticated users can accept group invites" on public.group_invites;
drop policy if exists "Owners can update group invites" on public.group_invites;
create policy "Owners can update group invites"
on public.group_invites for update
to authenticated
using (public.is_group_owner(group_id))
with check (public.is_group_owner(group_id));

drop policy if exists "Invitees can reject own pending invites" on public.group_invites;
create policy "Invitees can reject own pending invites"
on public.group_invites for update
to authenticated
using (
  email is not null
  and lower(trim(email)) = public.current_auth_email()
  and coalesce(used, false) is false
  and rejected_at is null
  and accepted_at is null
  and (expires_at is null or expires_at > now())
)
with check (
  email is not null
  and lower(trim(email)) = public.current_auth_email()
);

grant select, insert, update, delete on public.group_invites to authenticated;

revoke execute on function public.current_auth_email() from public, anon;
grant execute on function public.current_auth_email() to authenticated;

revoke execute on function public.create_group_invite(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_group_invite(uuid, text, text, text, timestamptz) to authenticated;

revoke execute on function public.get_pending_group_invites() from public, anon;
grant execute on function public.get_pending_group_invites() to authenticated;

revoke execute on function public.accept_group_invite(text) from public, anon;
grant execute on function public.accept_group_invite(text) to authenticated;

revoke execute on function public.reject_group_invite(text) from public, anon;
grant execute on function public.reject_group_invite(text) to authenticated;
