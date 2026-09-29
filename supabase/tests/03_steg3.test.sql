-- Steg 3: bilbarnstolar spärras, kvot för bildtolkning
\set anna '''a0000000-0000-0000-0000-00000000000a'''
select tests.create_user(:anna, 'anna@test.se');
set role authenticated;
select tests.login(:anna);
select public.save_profile('Anna', 'v1');
select public.set_home('A 1', '12649', 'Hägersten', 59.30670, 18.00130, 'Aspudden');
insert into storage.objects (bucket_id, name, owner, owner_id)
select 'listing-photos', 'a0000000-0000-0000-0000-00000000000a/' || n || '.jpg', :anna, :anna from unnest(array['x', 'xt']) n;

select tests.throws($$select public.create_listing('gear', 'like_new', 'a0000000-0000-0000-0000-00000000000a/x.jpg', 'a0000000-0000-0000-0000-00000000000a/xt.jpg', 'door', p_description => 'Fin bilbarnstol, knappt använd')$$,
  'BJUSS_CAR_SEAT', 'bilbarnstol i beskrivningen spärras');
select tests.throws($$select public.create_listing('gear', 'like_new', 'a0000000-0000-0000-0000-00000000000a/x.jpg', 'a0000000-0000-0000-0000-00000000000a/xt.jpg', 'door', p_brand => 'Britax babyskydd')$$,
  'BJUSS_CAR_SEAT', 'babyskydd i märket spärras');
select tests.throws($$select public.create_listing('gear', 'like_new', 'a0000000-0000-0000-0000-00000000000a/x.jpg', 'a0000000-0000-0000-0000-00000000000a/xt.jpg', 'door', p_description => 'BÄLTESSTOL 15-36 kg')$$,
  'BJUSS_CAR_SEAT', 'bältesstol med versaler spärras');
select tests.throws($$select public.create_listing('gear', 'like_new', 'a0000000-0000-0000-0000-00000000000a/x.jpg', 'a0000000-0000-0000-0000-00000000000a/xt.jpg', 'door', p_instructions => 'bilstolen står i trapphuset')$$,
  'BJUSS_CAR_SEAT', 'bilstol i instruktionen spärras');
select public.create_listing('gear', 'like_new', 'a0000000-0000-0000-0000-00000000000a/x.jpg', 'a0000000-0000-0000-0000-00000000000a/xt.jpg', 'door',
  p_subcategory => 'Matstol', p_description => 'Matstol i trä', p_ai_suggested => true) as ok_listing \gset
select tests.ok((select ai_suggested from public.listings where id = :'ok_listing'), 'matstol går bra och AI-flaggan sparas');

reset role;
select tests.throws(format($f$update public.listings set description = 'nu en bilbarnstol' where id = %L$f$, :'ok_listing'),
  'BJUSS_CAR_SEAT', 'spärren gäller även ändringar direkt i databasen');
set role authenticated;

-- Kvot
reset role;
update public.app_settings set ai_daily_limit = 2;
set role authenticated;
select tests.ok(public.consume_ai_quota() = 1, 'första tolkningen, en kvar');
select tests.ok(public.consume_ai_quota() = 0, 'andra tolkningen, noll kvar');
select tests.throws('select public.consume_ai_quota()', 'BJUSS_AI_LIMIT', 'tredje tolkningen stoppas');
select tests.login(null);
set role anon;
select tests.throws('select public.consume_ai_quota()', 'permission denied', 'anonyma kan inte använda bildtolkningen');
