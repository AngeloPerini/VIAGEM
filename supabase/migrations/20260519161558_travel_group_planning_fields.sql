-- Planning fields used by manual and AI-assisted trip creation.

alter table public.travel_groups
  add column if not exists countries text[] default '{}',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists travel_style text,
  add column if not exists notes text;

notify pgrst, 'reload schema';
