-- Hjälpfunktioner för databastesterna (körs bara i den lokala testmiljön)
create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.ok(p_cond boolean, p_msg text) returns text
language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'TEST MISSLYCKADES: %', p_msg;
  end if;
  return 'ok: ' || p_msg;
end $$;

-- Kör SQL och kräver att det blir fel som matchar mönstret
create or replace function tests.throws(p_sql text, p_pattern text, p_msg text) returns text
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      return 'ok: ' || p_msg;
    end if;
    raise exception 'TEST MISSLYCKADES: % (fel: %, väntade: %)', p_msg, sqlerrm, p_pattern;
  end;
  raise exception 'TEST MISSLYCKADES: % (inget fel uppstod, väntade: %)', p_msg, p_pattern;
end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- Testanvändare
create or replace function tests.create_user(p_id uuid, p_email text) returns void
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
          '{"provider":"email"}', '{}', now(), now())
$$;

-- Byt till en inloggad användare (eller anonym om p_id är null)
create or replace function tests.login(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_id is null then '{"role":"anon"}'
    else json_build_object('sub', p_id, 'role', 'authenticated')::text end, false);
  perform set_config('request.jwt.claim.sub', coalesce(p_id::text, ''), false);
end $$;
