-- Adds lifecycle status for trip history on the profile page.
-- Existing rows keep working and default to "planned".
alter table public.travel_groups
add column if not exists status text default 'planned';

update public.travel_groups
set status = 'planned'
where status is null;

alter table public.travel_groups
alter column status set default 'planned';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'travel_groups_status_check'
      and conrelid = 'public.travel_groups'::regclass
  ) then
    alter table public.travel_groups
    add constraint travel_groups_status_check
    check (status in ('planned', 'active', 'completed', 'canceled'));
  end if;
end $$;

create index if not exists travel_groups_status_idx
on public.travel_groups(status);
