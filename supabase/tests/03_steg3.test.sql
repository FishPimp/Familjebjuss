-- Steg 3: bilbarnstolar spärras (bildtolkningen med Claude är borttagen – den kostade pengar)
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
  p_subcategory => 'Matstol', p_description => 'Matstol i trä') as ok_listing \gset
select tests.ok((select count(*) from public.listings where id = :'ok_listing') = 1, 'matstol går bra');

reset role;
select tests.throws(format($f$update public.listings set description = 'nu en bilbarnstol' where id = %L$f$, :'ok_listing'),
  'BJUSS_CAR_SEAT', 'spärren gäller även ändringar direkt i databasen');
set role authenticated;

-- Bildtolkningen är borttagen
select tests.ok(to_regprocedure('public.consume_ai_quota()') is null, 'ingen betald bildtolkning finns kvar');
