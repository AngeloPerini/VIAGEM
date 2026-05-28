create table if not exists public.trip_checklist_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null,
  category text not null default 'Outros',
  notes text,
  quantity integer not null default 1,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_checklist_items_title_not_blank check (length(trim(title)) > 0),
  constraint trip_checklist_items_quantity_positive check (quantity > 0),
  constraint trip_checklist_items_category_check check (
    category in (
      'Documentos',
      'Roupas',
      'Higiene',
      'Eletronicos',
      'Remedios',
      'Utensilios',
      'Acessorios',
      'Outros'
    )
  )
);

create index if not exists trip_checklist_items_group_id_idx
on public.trip_checklist_items(group_id);

create index if not exists trip_checklist_items_assigned_to_idx
on public.trip_checklist_items(assigned_to)
where assigned_to is not null;

drop trigger if exists update_trip_checklist_items_updated_at on public.trip_checklist_items;
create trigger update_trip_checklist_items_updated_at
before update on public.trip_checklist_items
for each row execute function public.update_updated_at_column();

alter table public.trip_checklist_items enable row level security;

drop policy if exists "Members can view trip checklist items" on public.trip_checklist_items;
create policy "Members can view trip checklist items"
on public.trip_checklist_items for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "Members can create trip checklist items" on public.trip_checklist_items;
create policy "Members can create trip checklist items"
on public.trip_checklist_items for insert
to authenticated
with check (
  public.is_group_member(group_id)
  and created_by = (select auth.uid())
  and (
    assigned_to is null
    or exists (
      select 1
      from public.group_members member
      where member.group_id = trip_checklist_items.group_id
        and member.user_id = trip_checklist_items.assigned_to
    )
  )
);

drop policy if exists "Members can update trip checklist items" on public.trip_checklist_items;
create policy "Members can update trip checklist items"
on public.trip_checklist_items for update
to authenticated
using (public.is_group_member(group_id))
with check (
  public.is_group_member(group_id)
  and (
    assigned_to is null
    or exists (
      select 1
      from public.group_members member
      where member.group_id = trip_checklist_items.group_id
        and member.user_id = trip_checklist_items.assigned_to
    )
  )
);

drop policy if exists "Members can delete trip checklist items" on public.trip_checklist_items;
create policy "Members can delete trip checklist items"
on public.trip_checklist_items for delete
to authenticated
using (public.is_group_member(group_id));

grant select, insert, delete on public.trip_checklist_items to authenticated;
grant update (assigned_to, title, category, notes, quantity, checked) on public.trip_checklist_items to authenticated;
revoke all on public.trip_checklist_items from anon;

alter table public.trip_checklist_items replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'trip_checklist_items'
    )
  then
    alter publication supabase_realtime add table public.trip_checklist_items;
  end if;
end $$;
