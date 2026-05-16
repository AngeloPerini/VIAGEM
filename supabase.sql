-- Supabase schema for the Europa trip dashboard.
-- Run this file once in Supabase SQL Editor before using the deployed site.

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  country text not null,
  description text not null,
  details text,
  euro_min numeric,
  euro_max numeric,
  brl_min numeric,
  brl_max numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day text not null,
  country text not null,
  city text,
  time text,
  title text not null,
  description text,
  type text,
  order_index int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.attractions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  city text,
  day text,
  time text,
  description text,
  visited boolean default false,
  photo_url text,
  order_index int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

alter table public.expenses enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.attractions enable row level security;

grant usage on schema public to anon;
grant select, insert, update, delete on public.expenses to anon;
grant select, insert, update, delete on public.itinerary_items to anon;
grant select, insert, update, delete on public.attractions to anon;

drop policy if exists "Allow anon select expenses" on public.expenses;
create policy "Allow anon select expenses"
on public.expenses for select
to anon
using (true);

drop policy if exists "Allow anon insert expenses" on public.expenses;
create policy "Allow anon insert expenses"
on public.expenses for insert
to anon
with check (true);

drop policy if exists "Allow anon update expenses" on public.expenses;
create policy "Allow anon update expenses"
on public.expenses for update
to anon
using (true)
with check (true);

drop policy if exists "Allow anon delete expenses" on public.expenses;
create policy "Allow anon delete expenses"
on public.expenses for delete
to anon
using (true);

drop policy if exists "Allow anon select itinerary" on public.itinerary_items;
create policy "Allow anon select itinerary"
on public.itinerary_items for select
to anon
using (true);

drop policy if exists "Allow anon insert itinerary" on public.itinerary_items;
create policy "Allow anon insert itinerary"
on public.itinerary_items for insert
to anon
with check (true);

drop policy if exists "Allow anon update itinerary" on public.itinerary_items;
create policy "Allow anon update itinerary"
on public.itinerary_items for update
to anon
using (true)
with check (true);

drop policy if exists "Allow anon delete itinerary" on public.itinerary_items;
create policy "Allow anon delete itinerary"
on public.itinerary_items for delete
to anon
using (true);

drop policy if exists "Allow anon select attractions" on public.attractions;
create policy "Allow anon select attractions"
on public.attractions for select
to anon
using (true);

drop policy if exists "Allow anon insert attractions" on public.attractions;
create policy "Allow anon insert attractions"
on public.attractions for insert
to anon
with check (true);

drop policy if exists "Allow anon update attractions" on public.attractions;
create policy "Allow anon update attractions"
on public.attractions for update
to anon
using (true)
with check (true);

drop policy if exists "Allow anon delete attractions" on public.attractions;
create policy "Allow anon delete attractions"
on public.attractions for delete
to anon
using (true);

insert into storage.buckets (id, name, public)
values ('attraction-photos', 'attraction-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Allow public read attraction photos" on storage.objects;
create policy "Allow public read attraction photos"
on storage.objects for select
to anon
using (bucket_id = 'attraction-photos');

drop policy if exists "Allow anon upload attraction photos" on storage.objects;
create policy "Allow anon upload attraction photos"
on storage.objects for insert
to anon
with check (bucket_id = 'attraction-photos');

drop policy if exists "Allow anon update attraction photos" on storage.objects;
create policy "Allow anon update attraction photos"
on storage.objects for update
to anon
using (bucket_id = 'attraction-photos')
with check (bucket_id = 'attraction-photos');

drop policy if exists "Allow anon delete attraction photos" on storage.objects;
create policy "Allow anon delete attraction photos"
on storage.objects for delete
to anon
using (bucket_id = 'attraction-photos');

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
end $$;
