-- Teste transacional P0 com dois usuarios existentes.
-- Nao cria, atualiza ou remove dados persistentes; toda a sessao termina em ROLLBACK.

begin;

do $test$
declare
  test_group_id uuid;
  user_a_id uuid;
  user_b_id uuid;
  owner_before uuid;
  owner_after uuid;
  expected_expenses bigint;
  expected_itinerary bigint;
  expected_attractions bigint;
  expected_checklist bigint;
  visible_count bigint;
  claim_owner_blocked boolean := false;
  claim_legacy_blocked boolean := false;
begin
  select tg.id, tg.owner_id
  into test_group_id, user_a_id
  from public.travel_groups tg
  where exists (
    select 1
    from auth.users candidate
    where candidate.id <> tg.owner_id
      and not exists (
        select 1
        from public.group_members gm
        where gm.group_id = tg.id
          and gm.user_id = candidate.id
      )
  )
  order by tg.created_at asc
  limit 1;

  if test_group_id is null or user_a_id is null then
    raise exception 'Teste P0 exige uma viagem com owner e outro usuario que nao seja membro.';
  end if;

  select candidate.id
  into user_b_id
  from auth.users candidate
  where candidate.id <> user_a_id
    and not exists (
      select 1
      from public.group_members gm
      where gm.group_id = test_group_id
        and gm.user_id = candidate.id
    )
  order by candidate.created_at asc
  limit 1;

  if user_b_id is null then
    raise exception 'Teste P0 exige pelo menos dois usuarios distintos.';
  end if;

  select owner_id
  into owner_before
  from public.travel_groups
  where id = test_group_id;

  select count(*) into expected_expenses
  from public.expenses
  where group_id = test_group_id;

  select count(*) into expected_itinerary
  from public.itinerary_items
  where group_id = test_group_id;

  select count(*) into expected_attractions
  from public.attractions
  where group_id = test_group_id;

  select count(*) into expected_checklist
  from public.trip_checklist_items
  where group_id = test_group_id;

  -- Usuario A: owner legitimo continua vendo a viagem e todo o conteudo do grupo.
  perform set_config('request.jwt.claim.sub', user_a_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  select count(*) into visible_count
  from public.travel_groups
  where id = test_group_id;
  if visible_count <> 1 then
    raise exception 'Usuario A nao consegue acessar sua propria viagem.';
  end if;

  select count(*) into visible_count
  from public.expenses
  where group_id = test_group_id;
  if visible_count <> expected_expenses then
    raise exception 'Usuario A nao consegue acessar todas as despesas da propria viagem.';
  end if;

  select count(*) into visible_count
  from public.itinerary_items
  where group_id = test_group_id;
  if visible_count <> expected_itinerary then
    raise exception 'Usuario A nao consegue acessar todo o roteiro da propria viagem.';
  end if;

  select count(*) into visible_count
  from public.attractions
  where group_id = test_group_id;
  if visible_count <> expected_attractions then
    raise exception 'Usuario A nao consegue acessar todas as atracoes da propria viagem.';
  end if;

  select count(*) into visible_count
  from public.trip_checklist_items
  where group_id = test_group_id;
  if visible_count <> expected_checklist then
    raise exception 'Usuario A nao consegue acessar todo o checklist da propria viagem.';
  end if;

  execute 'reset role';

  -- Usuario B: autenticado comum e sem membership no grupo de A.
  perform set_config('request.jwt.claim.sub', user_b_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  select count(*) into visible_count
  from public.travel_groups
  where id = test_group_id;
  if visible_count <> 0 then
    raise exception 'Usuario B consegue acessar a viagem do Usuario A.';
  end if;

  select count(*) into visible_count
  from public.expenses
  where group_id = test_group_id;
  if visible_count <> 0 then
    raise exception 'Usuario B consegue acessar despesas do Usuario A.';
  end if;

  select count(*) into visible_count
  from public.itinerary_items
  where group_id = test_group_id;
  if visible_count <> 0 then
    raise exception 'Usuario B consegue acessar roteiro do Usuario A.';
  end if;

  select count(*) into visible_count
  from public.attractions
  where group_id = test_group_id;
  if visible_count <> 0 then
    raise exception 'Usuario B consegue acessar atracoes do Usuario A.';
  end if;

  select count(*) into visible_count
  from public.trip_checklist_items
  where group_id = test_group_id;
  if visible_count <> 0 then
    raise exception 'Usuario B consegue acessar checklist/documentos do Usuario A.';
  end if;

  begin
    perform public.claim_owner_trip_group('attacker@example.invalid', 'P0 unauthorized claim');
  exception
    when insufficient_privilege then
      claim_owner_blocked := true;
  end;

  begin
    perform public.claim_legacy_trip_group('P0 unauthorized legacy claim', 'attacker@example.invalid');
  exception
    when insufficient_privilege then
      claim_legacy_blocked := true;
  end;

  execute 'reset role';

  if not claim_owner_blocked then
    raise exception 'authenticated ainda consegue executar claim_owner_trip_group.';
  end if;

  if not claim_legacy_blocked then
    raise exception 'authenticated ainda consegue executar claim_legacy_trip_group.';
  end if;

  select owner_id
  into owner_after
  from public.travel_groups
  where id = test_group_id;

  if owner_after is distinct from owner_before then
    raise exception 'O owner_id da viagem mudou durante o teste P0.';
  end if;

  raise notice 'P0 PASS: A manteve acesso; B ficou isolado e nao executou as RPCs de claim.';
end;
$test$;

rollback;
