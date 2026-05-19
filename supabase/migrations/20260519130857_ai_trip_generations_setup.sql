-- AI trip generation history and access control.
-- Generated plans are previews first: applying them is done by the authenticated frontend
-- through the existing group-scoped tables and RLS policies.

create table if not exists public.ai_trip_generations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'generated',
  feedback text,
  created_at timestamptz default now()
);

create index if not exists ai_trip_generations_group_id_idx
  on public.ai_trip_generations(group_id);

create index if not exists ai_trip_generations_user_id_idx
  on public.ai_trip_generations(user_id);

create index if not exists ai_trip_generations_created_at_idx
  on public.ai_trip_generations(created_at desc);

grant select, insert, update on public.ai_trip_generations to authenticated;
revoke all on public.ai_trip_generations from anon;

alter table public.ai_trip_generations enable row level security;

drop policy if exists "Members can view AI trip generations" on public.ai_trip_generations;
drop policy if exists "Members can create AI trip generations" on public.ai_trip_generations;
drop policy if exists "Users can update own AI trip generations" on public.ai_trip_generations;

create policy "Members can view AI trip generations"
on public.ai_trip_generations for select
to authenticated
using (public.is_group_member(group_id));

create policy "Members can create AI trip generations"
on public.ai_trip_generations for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_group_member(group_id)
);

create policy "Users can update own AI trip generations"
on public.ai_trip_generations for update
to authenticated
using (
  user_id = auth.uid()
  and public.is_group_member(group_id)
)
with check (
  user_id = auth.uid()
  and public.is_group_member(group_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_trip_generations'
  ) then
    alter publication supabase_realtime add table public.ai_trip_generations;
  end if;
end $$;
