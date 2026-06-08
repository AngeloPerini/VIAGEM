alter table public.profiles
  add column if not exists origin_currency text not null default 'BRL';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_origin_currency_check'
  ) then
    alter table public.profiles
      add constraint profiles_origin_currency_check
      check (origin_currency in ('BRL', 'EUR', 'USD', 'GBP', 'CHF', 'JPY'));
  end if;
end $$;

update public.profiles
set origin_currency = 'BRL'
where origin_currency is null
   or origin_currency not in ('BRL', 'EUR', 'USD', 'GBP', 'CHF', 'JPY');

grant update (origin_currency, updated_at) on public.profiles to authenticated;
