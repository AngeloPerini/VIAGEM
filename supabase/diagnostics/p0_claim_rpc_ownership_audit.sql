-- Auditoria P0 de ownership e isolamento.
-- Somente leitura: este arquivo nao altera nem remove dados.

-- 1) Confirmar assinatura, SECURITY DEFINER e privilegios efetivos das RPCs.
select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
  pg_get_userbyid(p.proowner) as function_owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_owner_trip_group', 'claim_legacy_trip_group')
order by p.oid::regprocedure::text;

-- 2) Grupos cujo owner_id nao possui exatamente o papel owner no membership.
select
  tg.id as group_id,
  tg.name as group_name,
  tg.owner_id,
  owner_user.email as owner_email,
  gm.id as owner_membership_id,
  gm.role as owner_membership_role,
  tg.created_at,
  tg.updated_at
from public.travel_groups tg
left join auth.users owner_user on owner_user.id = tg.owner_id
left join public.group_members gm
  on gm.group_id = tg.id
 and gm.user_id = tg.owner_id
where gm.id is null
   or gm.role <> 'owner'
order by tg.updated_at desc nulls last, tg.created_at desc;

-- 3) Grupos com mais de um membro marcado como owner.
select
  gm.group_id,
  tg.name as group_name,
  count(*) as owner_memberships,
  array_agg(gm.user_id order by gm.created_at) as owner_user_ids,
  array_agg(coalesce(p.email, auth_user.email) order by gm.created_at) as owner_emails
from public.group_members gm
join public.travel_groups tg on tg.id = gm.group_id
left join public.profiles p on p.id = gm.user_id
left join auth.users auth_user on auth_user.id = gm.user_id
where gm.role = 'owner'
group by gm.group_id, tg.name
having count(*) > 1
order by owner_memberships desc, tg.name;

-- 4) Memberships owner que nao correspondem ao travel_groups.owner_id.
select
  gm.group_id,
  tg.name as group_name,
  tg.owner_id as canonical_owner_id,
  gm.user_id as conflicting_owner_id,
  coalesce(p.email, auth_user.email) as conflicting_owner_email,
  gm.created_at as membership_created_at
from public.group_members gm
join public.travel_groups tg on tg.id = gm.group_id
left join public.profiles p on p.id = gm.user_id
left join auth.users auth_user on auth_user.id = gm.user_id
where gm.role = 'owner'
  and gm.user_id <> tg.owner_id
order by gm.created_at desc;

-- 5) Membros duplicados por grupo/usuario (deve retornar zero pela unique constraint).
select
  group_id,
  user_id,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as membership_ids
from public.group_members
group by group_id, user_id
having count(*) > 1
order by duplicate_count desc;

-- 6) Registros legados sem group_id.
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
where group_id is null
union all
select 'trip_checklist_items', count(*)
from public.trip_checklist_items
where group_id is null;

-- 7) Registros com group_id apontando para grupo inexistente.
select 'expenses' as table_name, e.id as record_id, e.group_id
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
where a.group_id is not null and tg.id is null
union all
select 'trip_checklist_items', c.id, c.group_id
from public.trip_checklist_items c
left join public.travel_groups tg on tg.id = c.group_id
where c.group_id is not null and tg.id is null;

-- 8) Grupos alterados recentemente. Sao candidatos para revisao manual de troca de owner_id;
-- o schema atual nao possui historico de owner_id, portanto updated_at sozinho nao prova abuso.
select
  tg.id as group_id,
  tg.name as group_name,
  tg.owner_id,
  owner_user.email as owner_email,
  tg.created_at,
  tg.updated_at
from public.travel_groups tg
left join auth.users owner_user on owner_user.id = tg.owner_id
where tg.updated_at >= now() - interval '30 days'
order by tg.updated_at desc;

-- 9) Registros antigos atualizados nos ultimos 30 dias, candidatos a movimentacao recente.
select 'expenses' as table_name, e.id as record_id, e.group_id, e.created_at, e.updated_at
from public.expenses e
where e.updated_at >= now() - interval '30 days'
  and e.updated_at > e.created_at + interval '1 minute'
union all
select 'itinerary_items', i.id, i.group_id, i.created_at, i.updated_at
from public.itinerary_items i
where i.updated_at >= now() - interval '30 days'
  and i.updated_at > i.created_at + interval '1 minute'
union all
select 'attractions', a.id, a.group_id, a.created_at, a.updated_at
from public.attractions a
where a.updated_at >= now() - interval '30 days'
  and a.updated_at > a.created_at + interval '1 minute'
union all
select 'trip_checklist_items', c.id, c.group_id, c.created_at, c.updated_at
from public.trip_checklist_items c
where c.updated_at >= now() - interval '30 days'
  and c.updated_at > c.created_at + interval '1 minute'
order by updated_at desc;

-- 10) RLS nas tabelas que protegem viagens e conteudo de grupo.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'travel_groups',
    'group_members',
    'expenses',
    'itinerary_items',
    'attractions',
    'trip_checklist_items'
  )
order by c.relname;

-- 11) Policies de isolamento relevantes.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'travel_groups',
    'group_members',
    'expenses',
    'itinerary_items',
    'attractions',
    'trip_checklist_items'
  )
order by tablename, policyname;
