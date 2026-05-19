-- Qualify profile columns inside the quota function so PL/pgSQL output
-- variables never shadow table columns.

create or replace function public.consume_ai_generation_quota(target_user_id uuid)
returns table (
  allowed boolean,
  error_code text,
  message text,
  ai_generations_used integer,
  ai_generations_limit integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_record public.profiles%rowtype;
begin
  if target_user_id is null then
    return query select false, 'UNAUTHENTICATED', 'Usuario nao autenticado.', 0, 3;
    return;
  end if;

  insert into public.profiles (id, ai_generations_used, ai_generations_limit, updated_at)
  values (target_user_id, 0, 3, now())
  on conflict (id) do nothing;

  select *
  into profile_record
  from public.profiles
  where id = target_user_id
  for update;

  if not found then
    return query select false, 'PROFILE_NOT_FOUND', 'Perfil nao encontrado.', 0, 3;
    return;
  end if;

  if coalesce(profile_record.ai_generations_used, 0) >= coalesce(profile_record.ai_generations_limit, 3) then
    return query select
      false,
      'AI_GENERATION_LIMIT_REACHED',
      'Você atingiu o limite gratuito de 3 gerações de viagem com IA.',
      coalesce(profile_record.ai_generations_used, 0),
      coalesce(profile_record.ai_generations_limit, 3);
    return;
  end if;

  if profile_record.last_ai_generation_at is not null
    and profile_record.last_ai_generation_at > now() - interval '30 seconds' then
    return query select
      false,
      'AI_GENERATION_COOLDOWN',
      'Aguarde alguns segundos antes de gerar novamente.',
      coalesce(profile_record.ai_generations_used, 0),
      coalesce(profile_record.ai_generations_limit, 3);
    return;
  end if;

  update public.profiles
  set ai_generations_used = coalesce(public.profiles.ai_generations_used, 0) + 1,
      ai_generations_limit = coalesce(public.profiles.ai_generations_limit, 3),
      last_ai_generation_at = now(),
      updated_at = now()
  where public.profiles.id = target_user_id
  returning * into profile_record;

  return query select
    true,
    null::text,
    null::text,
    profile_record.ai_generations_used,
    profile_record.ai_generations_limit;
end;
$$;

revoke execute on function public.consume_ai_generation_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_generation_quota(uuid) to service_role;
