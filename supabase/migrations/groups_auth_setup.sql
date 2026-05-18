-- Supabase setup for Google Auth, travel groups, invites, data isolation, Realtime and Storage.
-- Run with Supabase CLI or SQL Editor after enabling Google as an Auth provider in the Supabase dashboard.

create extension if not exists pgcrypto;

-- Shared updated_at trigger.
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Travel groups are the isolation boundary for every user-facing dataset.
create table if not exists public.travel_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  email text,
  token text not null unique,
  role text not null default 'member' check (role in ('owner', 'member')),
  used boolean default false,
  single_use boolean not null default false,
  used_count int not null default 0,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  expires_at timestamptz
);

-- Existing trip data now belongs to a group and records the authenticated author.
alter table public.expenses
  add column if not exists group_id uuid references public.travel_groups(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists links jsonb default '[]'::jsonb;

alter table public.itinerary_items
  add column if not exists group_id uuid references public.travel_groups(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists completed boolean default false,
  add column if not exists links jsonb default '[]'::jsonb;

alter table public.attractions
  add column if not exists group_id uuid references public.travel_groups(id) on delete cascade,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists links jsonb default '[]'::jsonb;

alter table public.group_invites
  add column if not exists single_use boolean not null default false,
  add column if not exists used_count int not null default 0;

-- Helpful indexes for RLS checks, group queries and Realtime filters.
create index if not exists travel_groups_owner_id_idx on public.travel_groups(owner_id);
create index if not exists group_members_group_id_idx on public.group_members(group_id);
create index if not exists group_members_user_id_idx on public.group_members(user_id);
create index if not exists group_invites_group_id_idx on public.group_invites(group_id);
create index if not exists group_invites_token_idx on public.group_invites(token);
create index if not exists expenses_group_id_idx on public.expenses(group_id);
create index if not exists itinerary_items_group_id_idx on public.itinerary_items(group_id);
create index if not exists attractions_group_id_idx on public.attractions(group_id);

drop trigger if exists update_travel_groups_updated_at on public.travel_groups;
create trigger update_travel_groups_updated_at
before update on public.travel_groups
for each row execute function public.update_updated_at_column();

drop trigger if exists update_expenses_updated_at on public.expenses;
create trigger update_expenses_updated_at
before update on public.expenses
for each row execute function public.update_updated_at_column();

drop trigger if exists update_itinerary_items_updated_at on public.itinerary_items;
create trigger update_itinerary_items_updated_at
before update on public.itinerary_items
for each row execute function public.update_updated_at_column();

drop trigger if exists update_attractions_updated_at on public.attractions;
create trigger update_attractions_updated_at
before update on public.attractions
for each row execute function public.update_updated_at_column();

-- Owners are automatically added as group members when a group is created.
create or replace function public.add_group_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update
    set role = 'owner';

  return new;
end;
$$;

drop trigger if exists add_group_owner_member_after_insert on public.travel_groups;
create trigger add_group_owner_member_after_insert
after insert on public.travel_groups
for each row execute function public.add_group_owner_member();

-- SECURITY DEFINER helpers keep RLS policies readable and avoid recursive group_members checks.
create or replace function public.is_group_member(target_group_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_group_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.group_members member
      where member.group_id = target_group_id
        and member.user_id = target_user_id
    );
$$;

create or replace function public.is_group_owner(target_group_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_group_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.travel_groups travel_group
      where travel_group.id = target_group_id
        and travel_group.owner_id = target_user_id
    );
$$;

create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
security definer
set search_path = public
as $$
begin
  return value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

-- Accepting an invite happens through an RPC so invite tokens do not need broad SELECT access.
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

-- The owner e-mail has a reserved claim path. If the user already exists, the migration links
-- Viagem Europa immediately; otherwise this RPC does it on the first login for that e-mail.
create or replace function public.claim_owner_trip_group(
  owner_email text default 'aperini351@gmail.com',
  default_group_name text default 'Viagem Europa'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  default_group_id uuid;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select email
  into current_email
  from auth.users
  where id = current_user_id;

  if lower(coalesce(current_email, '')) <> lower(owner_email) then
    return null;
  end if;

  select id
  into default_group_id
  from public.travel_groups
  where name = default_group_name
  order by case when owner_id = current_user_id then 0 else 1 end, created_at asc
  limit 1;

  if default_group_id is null then
    insert into public.travel_groups (name, description, owner_id)
    values (default_group_name, 'Grupo principal vinculado ao proprietario da viagem.', current_user_id)
    returning id into default_group_id;
  else
    update public.travel_groups
    set owner_id = current_user_id
    where id = default_group_id;
  end if;

  update public.group_members
  set role = 'member'
  where group_id = default_group_id
    and user_id <> current_user_id
    and role = 'owner';

  insert into public.group_members (group_id, user_id, role)
  values (default_group_id, current_user_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  update public.expenses
  set group_id = default_group_id,
      created_by = coalesce(created_by, current_user_id)
  where group_id is null;

  update public.itinerary_items
  set group_id = default_group_id,
      created_by = coalesce(created_by, current_user_id)
  where group_id is null;

  update public.attractions
  set group_id = default_group_id,
      created_by = coalesce(created_by, current_user_id)
  where group_id is null;

  return default_group_id;
end;
$$;

drop function if exists public.claim_legacy_trip_group(text);

-- Safe legacy migration: only the configured owner e-mail can claim rows without group_id.
-- No data is deleted and no default rows are duplicated.
create or replace function public.claim_legacy_trip_group(
  default_group_name text default 'Viagem Europa',
  owner_email text default 'aperini351@gmail.com'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  default_group_id uuid;
  has_legacy_rows boolean;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select email
  into current_email
  from auth.users
  where id = current_user_id;

  if lower(coalesce(current_email, '')) <> lower(owner_email) then
    return null;
  end if;

  select exists (select 1 from public.expenses where group_id is null)
      or exists (select 1 from public.itinerary_items where group_id is null)
      or exists (select 1 from public.attractions where group_id is null)
  into has_legacy_rows;

  if not has_legacy_rows then
    return null;
  end if;

  select id
  into default_group_id
  from public.travel_groups
  where owner_id = current_user_id
    and name = default_group_name
  order by created_at asc
  limit 1;

  if default_group_id is null then
    insert into public.travel_groups (name, description, owner_id)
    values (default_group_name, 'Grupo criado automaticamente para migrar dados existentes.', current_user_id)
    returning id into default_group_id;
  else
    insert into public.group_members (group_id, user_id, role)
    values (default_group_id, current_user_id, 'owner')
    on conflict (group_id, user_id) do update set role = 'owner';
  end if;

  update public.expenses
  set group_id = default_group_id,
      created_by = coalesce(created_by, current_user_id)
  where group_id is null;

  update public.itinerary_items
  set group_id = default_group_id,
      created_by = coalesce(created_by, current_user_id)
  where group_id is null;

  update public.attractions
  set group_id = default_group_id,
      created_by = coalesce(created_by, current_user_id)
  where group_id is null;

  return default_group_id;
end;
$$;

-- If the owner account already exists, link the existing trip immediately during migration.
do $$
declare
  owner_email text := 'aperini351@gmail.com';
  owner_user_id uuid;
  default_group_id uuid;
begin
  select id
  into owner_user_id
  from auth.users
  where lower(email) = lower(owner_email)
  order by created_at asc
  limit 1;

  if owner_user_id is null then
    return;
  end if;

  select id
  into default_group_id
  from public.travel_groups
  where name = 'Viagem Europa'
  order by case when owner_id = owner_user_id then 0 else 1 end, created_at asc
  limit 1;

  if default_group_id is null then
    insert into public.travel_groups (name, description, owner_id)
    values ('Viagem Europa', 'Grupo principal vinculado ao proprietario da viagem.', owner_user_id)
    returning id into default_group_id;
  else
    update public.travel_groups
    set owner_id = owner_user_id
    where id = default_group_id;
  end if;

  update public.group_members
  set role = 'member'
  where group_id = default_group_id
    and user_id <> owner_user_id
    and role = 'owner';

  insert into public.group_members (group_id, user_id, role)
  values (default_group_id, owner_user_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  update public.expenses
  set group_id = default_group_id,
      created_by = coalesce(created_by, owner_user_id)
  where group_id is null;

  update public.itinerary_items
  set group_id = default_group_id,
      created_by = coalesce(created_by, owner_user_id)
  where group_id is null;

  update public.attractions
  set group_id = default_group_id,
      created_by = coalesce(created_by, owner_user_id)
  where group_id is null;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.travel_groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_invites to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.itinerary_items to authenticated;
grant select, insert, update, delete on public.attractions to authenticated;
grant execute on function public.accept_group_invite(text) to authenticated;
grant execute on function public.claim_owner_trip_group(text, text) to authenticated;
grant execute on function public.claim_legacy_trip_group(text, text) to authenticated;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
grant execute on function public.is_group_owner(uuid, uuid) to authenticated;
grant execute on function public.try_parse_uuid(text) to authenticated;

revoke all on public.travel_groups from anon;
revoke all on public.group_members from anon;
revoke all on public.group_invites from anon;
revoke all on public.expenses from anon;
revoke all on public.itinerary_items from anon;
revoke all on public.attractions from anon;

-- Remove old anon/public policies before creating authenticated, group-scoped policies.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'travel_groups',
        'group_members',
        'group_invites',
        'expenses',
        'itinerary_items',
        'attractions'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

drop policy if exists "Allow public read attraction photos" on storage.objects;
drop policy if exists "Allow anon upload attraction photos" on storage.objects;
drop policy if exists "Allow anon update attraction photos" on storage.objects;
drop policy if exists "Allow anon delete attraction photos" on storage.objects;
drop policy if exists "Members can read attraction photos" on storage.objects;
drop policy if exists "Members can upload attraction photos" on storage.objects;
drop policy if exists "Members can update attraction photos" on storage.objects;
drop policy if exists "Members can delete attraction photos" on storage.objects;

alter table public.travel_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.attractions enable row level security;

-- travel_groups: members can read, only owners can update/delete.
create policy "Members can view travel groups"
on public.travel_groups for select
to authenticated
using (public.is_group_member(id));

create policy "Authenticated users can create travel groups"
on public.travel_groups for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Owners can update travel groups"
on public.travel_groups for update
to authenticated
using (public.is_group_owner(id))
with check (public.is_group_owner(id));

create policy "Owners can delete travel groups"
on public.travel_groups for delete
to authenticated
using (public.is_group_owner(id));

-- group_members: group members can inspect membership, owners manage membership.
create policy "Members can view group members"
on public.group_members for select
to authenticated
using (public.is_group_member(group_id));

create policy "Owners can add group members"
on public.group_members for insert
to authenticated
with check (public.is_group_owner(group_id) and role = 'member');

create policy "Owners can update group members"
on public.group_members for update
to authenticated
using (
  public.is_group_owner(group_id)
  and user_id <> (
    select owner_id
    from public.travel_groups
    where public.travel_groups.id = public.group_members.group_id
  )
)
with check (public.is_group_owner(group_id) and role = 'member');

create policy "Owners can delete group members"
on public.group_members for delete
to authenticated
using (public.is_group_owner(group_id) and role <> 'owner');

-- group_invites: owners manage invites; logged-in users accept via RPC or mark a known invite as used.
create policy "Owners can view group invites"
on public.group_invites for select
to authenticated
using (public.is_group_owner(group_id));

create policy "Owners can create group invites"
on public.group_invites for insert
to authenticated
with check (
  public.is_group_owner(group_id)
  and created_by = auth.uid()
  and role in ('owner', 'member')
);

create policy "Authenticated users can accept group invites"
on public.group_invites for update
to authenticated
using (
  public.is_group_owner(group_id)
  or (
    auth.uid() is not null
    and used is false
    and (expires_at is null or expires_at > now())
  )
)
with check (
  public.is_group_owner(group_id)
  or (auth.uid() is not null and used is true)
);

create policy "Owners can delete group invites"
on public.group_invites for delete
to authenticated
using (public.is_group_owner(group_id));

-- Group-scoped data policies: every query and write is constrained by group membership.
create policy "Members can view expenses"
on public.expenses for select
to authenticated
using (public.is_group_member(group_id));

create policy "Members can create expenses"
on public.expenses for insert
to authenticated
with check (public.is_group_member(group_id) and created_by = auth.uid());

create policy "Members can update expenses"
on public.expenses for update
to authenticated
using (public.is_group_member(group_id))
with check (public.is_group_member(group_id));

create policy "Members can delete expenses"
on public.expenses for delete
to authenticated
using (public.is_group_member(group_id));

create policy "Members can view itinerary items"
on public.itinerary_items for select
to authenticated
using (public.is_group_member(group_id));

create policy "Members can create itinerary items"
on public.itinerary_items for insert
to authenticated
with check (public.is_group_member(group_id) and created_by = auth.uid());

create policy "Members can update itinerary items"
on public.itinerary_items for update
to authenticated
using (public.is_group_member(group_id))
with check (public.is_group_member(group_id));

create policy "Members can delete itinerary items"
on public.itinerary_items for delete
to authenticated
using (public.is_group_member(group_id));

create policy "Members can view attractions"
on public.attractions for select
to authenticated
using (public.is_group_member(group_id));

create policy "Members can create attractions"
on public.attractions for insert
to authenticated
with check (public.is_group_member(group_id) and created_by = auth.uid());

create policy "Members can update attractions"
on public.attractions for update
to authenticated
using (public.is_group_member(group_id))
with check (public.is_group_member(group_id));

create policy "Members can delete attractions"
on public.attractions for delete
to authenticated
using (public.is_group_member(group_id));

-- Private Storage bucket. New photo paths use attraction-photos/{groupId}/{attractionId}/photo.jpg.
insert into storage.buckets (id, name, public)
values ('attraction-photos', 'attraction-photos', false)
on conflict (id) do update set public = false;

create policy "Members can read attraction photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'attraction-photos'
  and (
    public.is_group_member(public.try_parse_uuid((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'attractions'
      and exists (
        select 1
        from public.attractions attraction
        where attraction.id::text = (storage.foldername(name))[2]
          and public.is_group_member(attraction.group_id)
      )
    )
  )
);

create policy "Members can upload attraction photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'attraction-photos'
  and public.is_group_member(public.try_parse_uuid((storage.foldername(name))[1]))
);

create policy "Members can update attraction photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'attraction-photos'
  and public.is_group_member(public.try_parse_uuid((storage.foldername(name))[1]))
)
with check (
  bucket_id = 'attraction-photos'
  and public.is_group_member(public.try_parse_uuid((storage.foldername(name))[1]))
);

create policy "Members can delete attraction photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'attraction-photos'
  and (
    public.is_group_member(public.try_parse_uuid((storage.foldername(name))[1]))
    or (
      (storage.foldername(name))[1] = 'attractions'
      and exists (
        select 1
        from public.attractions attraction
        where attraction.id::text = (storage.foldername(name))[2]
          and public.is_group_member(attraction.group_id)
      )
    )
  )
);

-- Realtime publication for all collaborative tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'itinerary_items'
  ) then
    alter publication supabase_realtime add table public.itinerary_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attractions'
  ) then
    alter publication supabase_realtime add table public.attractions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'travel_groups'
  ) then
    alter publication supabase_realtime add table public.travel_groups;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_members'
  ) then
    alter publication supabase_realtime add table public.group_members;
  end if;
end $$;
