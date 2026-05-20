-- In-app notifications, member self-leave, and owner trip editing.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references public.travel_groups(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists group_id uuid references public.travel_groups(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists read boolean not null default false;

create index if not exists notifications_user_read_created_idx
on public.notifications(user_id, read, created_at desc);

create index if not exists notifications_group_id_idx
on public.notifications(group_id);

create index if not exists notifications_type_idx
on public.notifications(type);

alter table public.notifications enable row level security;

drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
on public.notifications for delete
to authenticated
using (user_id = auth.uid());

revoke all on public.notifications from anon;
grant select, update, delete on public.notifications to authenticated;

create or replace function public.notification_actor_name(actor_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(profile.full_name, profile.email, auth_user.email, 'Viajante')
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_user_id;
$$;

create or replace function public.insert_notification(
  target_user_id uuid,
  target_group_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_metadata jsonb default '{}'::jsonb
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_record public.notifications%rowtype;
begin
  if target_user_id is null then
    raise exception 'Usuario da notificacao nao informado.' using errcode = '22023';
  end if;

  insert into public.notifications (
    user_id,
    group_id,
    type,
    title,
    message,
    metadata
  )
  values (
    target_user_id,
    target_group_id,
    notification_type,
    notification_title,
    notification_message,
    coalesce(notification_metadata, '{}'::jsonb)
  )
  returning * into notification_record;

  return notification_record;
end;
$$;

create or replace function public.create_notification(
  target_user_id uuid,
  target_group_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_metadata jsonb default '{}'::jsonb
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  if target_user_id <> current_user_id then
    if target_group_id is null
      or not public.is_group_member(target_group_id, current_user_id)
      or not public.is_group_member(target_group_id, target_user_id) then
      raise exception 'Voce nao pode criar notificacao para este usuario.' using errcode = '42501';
    end if;
  end if;

  return public.insert_notification(
    target_user_id,
    target_group_id,
    notification_type,
    notification_title,
    notification_message,
    notification_metadata
  );
end;
$$;

create or replace function public.notify_group_members(
  target_group_id uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_metadata jsonb default '{}'::jsonb,
  exclude_user_id uuid default auth.uid()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  inserted_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  if not public.is_group_member(target_group_id, current_user_id) then
    raise exception 'Voce nao participa desta viagem.' using errcode = '42501';
  end if;

  insert into public.notifications (
    user_id,
    group_id,
    type,
    title,
    message,
    metadata
  )
  select
    member.user_id,
    target_group_id,
    notification_type,
    notification_title,
    notification_message,
    coalesce(notification_metadata, '{}'::jsonb)
      || jsonb_build_object('actorUserId', current_user_id)
  from public.group_members member
  where member.group_id = target_group_id
    and member.user_id <> coalesce(exclude_user_id, current_user_id);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.sync_pending_invite_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text := public.current_auth_email();
  inserted_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  perform public.ensure_current_user_profile();

  if current_email is null or current_email = '' then
    return 0;
  end if;

  insert into public.notifications (
    user_id,
    group_id,
    type,
    title,
    message,
    metadata
  )
  select
    current_user_id,
    invite.group_id,
    'invite_received',
    'Convite recebido',
    coalesce(inviter.full_name, inviter.email, 'TripFlow')
      || ' convidou voce para a viagem '
      || travel_group.name
      || '.',
    jsonb_build_object(
      'token', invite.token,
      'inviteId', invite.id,
      'groupId', invite.group_id,
      'groupName', travel_group.name,
      'inviterUserId', invite.created_by,
      'expiresAt', invite.expires_at
    )
  from public.group_invites invite
  join public.travel_groups travel_group on travel_group.id = invite.group_id
  left join public.profiles inviter on inviter.id = invite.created_by
  where invite.email is not null
    and lower(trim(invite.email)) = current_email
    and coalesce(invite.used, false) is false
    and invite.rejected_at is null
    and invite.accepted_at is null
    and (invite.expires_at is null or invite.expires_at > now())
    and not exists (
      select 1
      from public.notifications existing_notification
      where existing_notification.user_id = current_user_id
        and existing_notification.type = 'invite_received'
        and existing_notification.metadata ->> 'token' = invite.token
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

drop function if exists public.create_group_invite(uuid, text, text, text, timestamptz);

create function public.create_group_invite(
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
  invited_user_id uuid;
  trip_name text;
  inviter_name text := public.notification_actor_name(current_user_id);
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

  select travel_group.name
  into trip_name
  from public.travel_groups travel_group
  where travel_group.id = target_group_id;

  select auth_user.id
  into invited_user_id
  from auth.users auth_user
  where lower(auth_user.email) = normalized_email
  limit 1;

  if invited_user_id is not null then
    perform public.insert_notification(
      invited_user_id,
      target_group_id,
      'invite_received',
      'Convite recebido',
      coalesce(inviter_name, 'TripFlow') || ' convidou voce para a viagem ' || coalesce(trip_name, 'TripFlow') || '.',
      jsonb_build_object(
        'token', token,
        'inviteId', id,
        'groupId', target_group_id,
        'groupName', trip_name,
        'inviterUserId', current_user_id,
        'expiresAt', expires_at
      )
    );
  end if;

  return next;
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
  actor_name text;
  trip_name text;
  notify_user_id uuid;
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

  update public.notifications
  set read = true
  where user_id = current_user_id
    and type = 'invite_received'
    and metadata ->> 'token' = target_invite.token;

  select travel_group.name
  into trip_name
  from public.travel_groups travel_group
  where travel_group.id = target_invite.group_id;

  actor_name := public.notification_actor_name(current_user_id);

  for notify_user_id in
    select distinct value
    from (
      select target_invite.created_by as value
      union
      select public.travel_groups.owner_id from public.travel_groups where public.travel_groups.id = target_invite.group_id
    ) recipients
    where value is not null and value <> current_user_id
  loop
    perform public.insert_notification(
      notify_user_id,
      target_invite.group_id,
      'invite_accepted',
      'Convite aceito',
      coalesce(actor_name, 'Alguem') || ' entrou na viagem ' || coalesce(trip_name, 'TripFlow') || '.',
      jsonb_build_object(
        'actorUserId', current_user_id,
        'groupId', target_invite.group_id,
        'groupName', trip_name,
        'inviteId', target_invite.id
      )
    );
  end loop;

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

  update public.notifications
  set read = true
  where user_id = current_user_id
    and type = 'invite_received'
    and metadata ->> 'token' = target_invite.token;

  return true;
end;
$$;

create or replace function public.leave_travel_group(target_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  membership_role text;
  trip_name text;
  trip_owner_id uuid;
  actor_name text;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  select member.role, travel_group.name, travel_group.owner_id
  into membership_role, trip_name, trip_owner_id
  from public.group_members member
  join public.travel_groups travel_group on travel_group.id = member.group_id
  where member.group_id = target_group_id
    and member.user_id = current_user_id
  for update;

  if not found then
    raise exception 'Voce nao participa desta viagem.' using errcode = '42501';
  end if;

  if membership_role = 'owner' then
    raise exception 'Owner nao pode sair sem transferir propriedade ou apagar a viagem.' using errcode = '42501';
  end if;

  delete from public.group_members
  where group_id = target_group_id
    and user_id = current_user_id;

  actor_name := public.notification_actor_name(current_user_id);

  if trip_owner_id is not null and trip_owner_id <> current_user_id then
    perform public.insert_notification(
      trip_owner_id,
      target_group_id,
      'member_left',
      'Membro saiu da viagem',
      coalesce(actor_name, 'Um membro') || ' saiu da viagem ' || coalesce(trip_name, 'TripFlow') || '.',
      jsonb_build_object('actorUserId', current_user_id, 'groupId', target_group_id, 'groupName', trip_name)
    );
  end if;

  return true;
end;
$$;

create or replace function public.update_travel_group_details(
  target_group_id uuid,
  group_name text default null,
  group_description text default null,
  group_countries text[] default null,
  group_start_date date default null,
  group_end_date date default null,
  group_travel_style text default null,
  group_status text default null
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
  updated_group public.travel_groups%rowtype;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.' using errcode = '28000';
  end if;

  if not public.is_group_owner(target_group_id, current_user_id) then
    raise exception 'Apenas o owner pode editar esta viagem.' using errcode = '42501';
  end if;

  if group_status is not null and group_status not in ('planned', 'active', 'completed', 'canceled') then
    raise exception 'Status da viagem invalido.' using errcode = '22023';
  end if;

  update public.travel_groups
  set name = coalesce(nullif(trim(group_name), ''), public.travel_groups.name),
      description = case when group_description is null then public.travel_groups.description else nullif(trim(group_description), '') end,
      countries = coalesce(group_countries, public.travel_groups.countries),
      start_date = coalesce(group_start_date, public.travel_groups.start_date),
      end_date = coalesce(group_end_date, public.travel_groups.end_date),
      travel_style = coalesce(nullif(trim(group_travel_style), ''), public.travel_groups.travel_style),
      status = coalesce(group_status, public.travel_groups.status),
      updated_at = now()
  where public.travel_groups.id = target_group_id
  returning * into updated_group;

  if updated_group.id is null then
    raise exception 'Viagem nao encontrada.' using errcode = 'P0002';
  end if;

  perform public.notify_group_members(
    target_group_id,
    'trip_updated',
    'Viagem atualizada',
    'A viagem ' || updated_group.name || ' foi atualizada.',
    jsonb_build_object('groupId', target_group_id, 'groupName', updated_group.name),
    current_user_id
  );

  return query
  select
    updated_group.id,
    updated_group.name,
    updated_group.description,
    updated_group.owner_id,
    coalesce(updated_group.status, 'planned'),
    coalesce(updated_group.countries, '{}'),
    updated_group.start_date,
    updated_group.end_date,
    updated_group.travel_style,
    updated_group.notes,
    updated_group.created_at,
    updated_group.updated_at,
    'owner'::text;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

revoke execute on function public.notification_actor_name(uuid) from public, anon;
grant execute on function public.notification_actor_name(uuid) to authenticated;

revoke execute on function public.insert_notification(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.insert_notification(uuid, uuid, text, text, text, jsonb) to service_role;

revoke execute on function public.create_notification(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.create_notification(uuid, uuid, text, text, text, jsonb) to authenticated;

revoke execute on function public.notify_group_members(uuid, text, text, text, jsonb, uuid) from public, anon;
grant execute on function public.notify_group_members(uuid, text, text, text, jsonb, uuid) to authenticated;

revoke execute on function public.sync_pending_invite_notifications() from public, anon;
grant execute on function public.sync_pending_invite_notifications() to authenticated;

revoke execute on function public.create_group_invite(uuid, text, text, text, timestamptz) from public, anon;
grant execute on function public.create_group_invite(uuid, text, text, text, timestamptz) to authenticated;

revoke execute on function public.accept_group_invite(text) from public, anon;
grant execute on function public.accept_group_invite(text) to authenticated;

revoke execute on function public.reject_group_invite(text) from public, anon;
grant execute on function public.reject_group_invite(text) to authenticated;

revoke execute on function public.leave_travel_group(uuid) from public, anon;
grant execute on function public.leave_travel_group(uuid) to authenticated;

revoke execute on function public.update_travel_group_details(uuid, text, text, text[], date, date, text, text) from public, anon;
grant execute on function public.update_travel_group_details(uuid, text, text, text[], date, date, text, text) to authenticated;
