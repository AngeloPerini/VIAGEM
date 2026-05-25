create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.travel_groups(id) on delete cascade,
  category_key text not null,
  name text not null,
  label text not null default 'Gasto',
  color text not null default '#475569',
  icon text,
  sort_order integer not null default 0,
  is_protected boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_category_key_not_empty check (char_length(trim(category_key)) > 0),
  constraint expense_categories_name_not_empty check (char_length(trim(name)) > 0)
);

create unique index if not exists expense_categories_group_category_key_key
on public.expense_categories(group_id, category_key);

create index if not exists expense_categories_group_order_idx
on public.expense_categories(group_id, sort_order, name);

drop trigger if exists update_expense_categories_updated_at on public.expense_categories;
create trigger update_expense_categories_updated_at
before update on public.expense_categories
for each row execute function public.update_updated_at_column();

alter table public.expense_categories enable row level security;

drop policy if exists "Members can view expense categories" on public.expense_categories;
create policy "Members can view expense categories"
on public.expense_categories for select
to authenticated
using (public.is_group_member(group_id));

drop policy if exists "Members can create expense categories" on public.expense_categories;
create policy "Members can create expense categories"
on public.expense_categories for insert
to authenticated
with check (public.is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "Members can update expense categories" on public.expense_categories;
create policy "Members can update expense categories"
on public.expense_categories for update
to authenticated
using (public.is_group_member(group_id))
with check (public.is_group_member(group_id));

drop policy if exists "Members can delete expense categories" on public.expense_categories;
create policy "Members can delete expense categories"
on public.expense_categories for delete
to authenticated
using (public.is_group_member(group_id) and is_protected is false);

grant select, insert, update, delete on public.expense_categories to authenticated;
revoke all on public.expense_categories from anon;

with default_categories(category_key, name, label, color, sort_order, is_protected) as (
  values
    ('lodging', 'Hospedagens', 'Cidade e datas', '#0f766e', 10, false),
    ('transport', 'Transportes', 'Trecho', '#2563eb', 20, false),
    ('tours', 'Passeios', 'Passeio', '#db2777', 30, false),
    ('Alimentação', 'Alimentação', 'Gasto', '#7c3aed', 40, false),
    ('Comprinhas', 'Comprinhas', 'Gasto', '#ea580c', 50, false),
    ('Documentos', 'Documentos', 'Documento', '#0891b2', 60, false),
    ('Seguro', 'Seguro', 'Seguro', '#65a30d', 70, false),
    ('Outros', 'Outros', 'Gasto', '#475569', 80, true)
)
insert into public.expense_categories (
  group_id,
  category_key,
  name,
  label,
  color,
  sort_order,
  is_protected,
  created_by
)
select
  travel_group.id,
  default_categories.category_key,
  default_categories.name,
  default_categories.label,
  default_categories.color,
  default_categories.sort_order,
  default_categories.is_protected,
  travel_group.owner_id
from public.travel_groups travel_group
cross join default_categories
on conflict (group_id, category_key) do nothing;

with default_keys(category_key) as (
  values
    ('lodging'),
    ('transport'),
    ('tours'),
    ('Alimentação'),
    ('Comprinhas'),
    ('Documentos'),
    ('Seguro'),
    ('Outros')
),
existing_categories as (
  select
    expenses.group_id,
    expenses.category as category_key,
    travel_groups.owner_id as created_by,
    row_number() over (partition by expenses.group_id order by expenses.category) as sort_rank
  from public.expenses expenses
  join public.travel_groups travel_groups on travel_groups.id = expenses.group_id
  left join default_keys on default_keys.category_key = expenses.category
  where expenses.group_id is not null
    and expenses.category is not null
    and trim(expenses.category) <> ''
    and default_keys.category_key is null
  group by expenses.group_id, expenses.category, travel_groups.owner_id
)
insert into public.expense_categories (
  group_id,
  category_key,
  name,
  label,
  color,
  sort_order,
  is_protected,
  created_by
)
select
  group_id,
  category_key,
  category_key,
  'Gasto',
  '#475569',
  1000 + sort_rank,
  false,
  created_by
from existing_categories
on conflict (group_id, category_key) do nothing;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'expense_categories'
    )
  then
    alter publication supabase_realtime add table public.expense_categories;
  end if;
end $$;
