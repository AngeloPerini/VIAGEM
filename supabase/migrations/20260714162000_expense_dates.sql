alter table public.expenses
  add column if not exists expense_date date null,
  add column if not exists check_in_date date null,
  add column if not exists check_out_date date null;

update public.expenses
set expense_date = coalesce(expense_date, created_at::date, current_date)
where expense_date is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_check_out_after_check_in'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_check_out_after_check_in
      check (
        check_in_date is null
        or check_out_date is null
        or check_out_date > check_in_date
      ) not valid;
  end if;
end $$;

alter table public.expenses validate constraint expenses_check_out_after_check_in;

create index if not exists expenses_group_expense_date_idx
on public.expenses(group_id, expense_date);

create index if not exists expenses_group_check_in_date_idx
on public.expenses(group_id, check_in_date);
