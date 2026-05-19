-- Diagnostico seguro de isolamento de viagens/grupos.
-- Este arquivo NAO apaga nem altera dados por padrao.
-- Execute em SQL Editor para listar possiveis vazamentos, dados sem group_id e duplicacoes.

-- 1) Grupos, donos e quantidade de membros.
select
  tg.id as group_id,
  tg.name,
  tg.status,
  tg.owner_id,
  owner.email as owner_email,
  count(gm.id) as members_count,
  tg.countries,
  tg.created_at
from public.travel_groups tg
left join auth.users owner on owner.id = tg.owner_id
left join public.group_members gm on gm.group_id = tg.id
group by tg.id, owner.email
order by tg.created_at desc;

-- 2) Membros por grupo.
select
  tg.id as group_id,
  tg.name as group_name,
  gm.user_id,
  p.email,
  p.full_name,
  gm.role,
  gm.created_at
from public.group_members gm
join public.travel_groups tg on tg.id = gm.group_id
left join public.profiles p on p.id = gm.user_id
order by tg.created_at desc, gm.created_at asc;

-- 3) Dados sem group_id.
select 'expenses' as table_name, count(*) as rows_without_group
from public.expenses
where group_id is null
union all
select 'itinerary_items', count(*)
from public.itinerary_items
where group_id is null
union all
select 'attractions', count(*)
from public.attractions
where group_id is null;

-- 4) Dados apontando para grupos inexistentes.
select 'expenses' as table_name, e.id, e.group_id
from public.expenses e
left join public.travel_groups tg on tg.id = e.group_id
where e.group_id is not null and tg.id is null
union all
select 'itinerary_items', i.id, i.group_id
from public.itinerary_items i
left join public.travel_groups tg on tg.id = i.group_id
where i.group_id is not null and tg.id is null
union all
select 'attractions', a.id, a.group_id
from public.attractions a
left join public.travel_groups tg on tg.id = a.group_id
where a.group_id is not null and tg.id is null;

-- 5) Duplicacoes de roteiro dentro do mesmo grupo.
select
  group_id,
  day,
  time,
  title,
  country,
  city,
  count(*) as duplicated_count,
  array_agg(id order by created_at asc) as duplicate_ids
from public.itinerary_items
group by group_id, day, time, title, country, city
having count(*) > 1
order by duplicated_count desc;

-- 6) Duplicacoes de pontos turisticos dentro do mesmo grupo.
select
  group_id,
  lower(trim(name)) as normalized_name,
  lower(trim(coalesce(country, ''))) as normalized_country,
  lower(trim(coalesce(city, ''))) as normalized_city,
  count(*) as duplicated_count,
  array_agg(id order by created_at asc) as duplicate_ids
from public.attractions
group by group_id, lower(trim(name)), lower(trim(coalesce(country, ''))), lower(trim(coalesce(city, '')))
having count(*) > 1
order by duplicated_count desc;

-- 7) Duplicacoes de gastos dentro do mesmo grupo.
select
  group_id,
  category,
  lower(trim(coalesce(country, ''))) as normalized_country,
  lower(trim(description)) as normalized_description,
  lower(trim(coalesce(details, ''))) as normalized_details,
  count(*) as duplicated_count,
  array_agg(id order by created_at asc) as duplicate_ids
from public.expenses
group by group_id, category, lower(trim(coalesce(country, ''))), lower(trim(description)), lower(trim(coalesce(details, '')))
having count(*) > 1
order by duplicated_count desc;

-- 8) Bloco opcional de limpeza manual de duplicados.
-- Revise os selects acima antes de executar qualquer delete.
-- Exemplo para roteiro de UM grupo especifico:
/*
with ranked as (
  select
    id,
    row_number() over (
      partition by group_id, day, time, title, country, city
      order by created_at asc
    ) as rn
  from public.itinerary_items
  where group_id = 'COLOQUE_O_GROUP_ID_AQUI'
)
delete from public.itinerary_items
where id in (select id from ranked where rn > 1);
*/
