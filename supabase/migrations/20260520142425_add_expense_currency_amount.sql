alter table public.expenses
  add column if not exists currency text not null default 'EUR',
  add column if not exists amount numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_currency_check'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_currency_check
      check (currency in ('BRL', 'EUR', 'USD', 'JPY', 'CHF', 'GBP')) not valid;
  end if;
end $$;

update public.expenses
set
  currency = coalesce(nullif(currency, ''), 'EUR'),
  amount = coalesce(amount, euro_min, brl_min, 0)
where amount is null
   or currency is null
   or currency = '';

alter table public.expenses validate constraint expenses_currency_check;
