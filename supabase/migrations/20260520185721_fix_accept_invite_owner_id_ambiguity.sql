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

revoke execute on function public.accept_group_invite(text) from public, anon;
grant execute on function public.accept_group_invite(text) to authenticated;

