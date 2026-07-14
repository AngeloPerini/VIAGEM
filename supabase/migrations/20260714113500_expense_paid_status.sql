alter table public.expenses
  add column if not exists is_paid boolean not null default false,
  add column if not exists paid_at timestamptz null;

update public.expenses
set paid_at = null
where is_paid is false
  and paid_at is not null;

create index if not exists expenses_group_paid_idx
on public.expenses(group_id, is_paid);
