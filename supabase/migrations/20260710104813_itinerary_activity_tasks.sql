create table if not exists public.itinerary_activity_tasks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  itinerary_item_id uuid not null references public.itinerary_items(id) on delete cascade,
  title text not null,
  description text,
  is_completed boolean not null default false,
  source text not null default 'manual',
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint itinerary_activity_tasks_title_not_blank check (length(trim(title)) > 0),
  constraint itinerary_activity_tasks_title_length check (char_length(trim(title)) <= 120),
  constraint itinerary_activity_tasks_source_check check (source in ('manual', 'ai'))
);

create index if not exists itinerary_activity_tasks_group_id_idx
on public.itinerary_activity_tasks(group_id);

create index if not exists itinerary_activity_tasks_itinerary_item_id_idx
on public.itinerary_activity_tasks(itinerary_item_id);

create index if not exists itinerary_activity_tasks_is_completed_idx
on public.itinerary_activity_tasks(is_completed);

create unique index if not exists itinerary_activity_tasks_item_title_unique_idx
on public.itinerary_activity_tasks(itinerary_item_id, lower(trim(title)));

drop trigger if exists update_itinerary_activity_tasks_updated_at on public.itinerary_activity_tasks;
create trigger update_itinerary_activity_tasks_updated_at
before update on public.itinerary_activity_tasks
for each row execute function public.update_updated_at_column();

alter table public.itinerary_activity_tasks enable row level security;

drop policy if exists "Members can view itinerary activity tasks" on public.itinerary_activity_tasks;
create policy "Members can view itinerary activity tasks"
on public.itinerary_activity_tasks for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "Members can create itinerary activity tasks" on public.itinerary_activity_tasks;
create policy "Members can create itinerary activity tasks"
on public.itinerary_activity_tasks for insert
to authenticated
with check (
  public.is_group_member(group_id)
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.itinerary_items item
    where item.id = itinerary_activity_tasks.itinerary_item_id
      and item.group_id = itinerary_activity_tasks.group_id
  )
);

drop policy if exists "Members can update itinerary activity tasks" on public.itinerary_activity_tasks;
create policy "Members can update itinerary activity tasks"
on public.itinerary_activity_tasks for update
to authenticated
using (public.is_group_member(group_id))
with check (
  public.is_group_member(group_id)
  and exists (
    select 1
    from public.itinerary_items item
    where item.id = itinerary_activity_tasks.itinerary_item_id
      and item.group_id = itinerary_activity_tasks.group_id
  )
);

drop policy if exists "Members can delete itinerary activity tasks" on public.itinerary_activity_tasks;
create policy "Members can delete itinerary activity tasks"
on public.itinerary_activity_tasks for delete
to authenticated
using (public.is_group_member(group_id));

revoke all on public.itinerary_activity_tasks from anon, authenticated;
grant select, insert, delete on public.itinerary_activity_tasks to authenticated;
grant update (title, description, is_completed) on public.itinerary_activity_tasks to authenticated;

alter table public.itinerary_activity_tasks replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'itinerary_activity_tasks'
    )
  then
    alter publication supabase_realtime add table public.itinerary_activity_tasks;
  end if;
end $$;
