-- Steg 2: barn, filter, 24-timmarsregel, pålitlighet, omdöme, blockera, rapportera, adressbyten
\set anna   '''a0000000-0000-0000-0000-00000000000a'''
\set bertil '''b0000000-0000-0000-0000-00000000000b'''
\set cecilia '''c0000000-0000-0000-0000-00000000000c'''
\set dave   '''d0000000-0000-0000-0000-00000000000d'''
\set erik   '''e0000000-0000-0000-0000-00000000000e'''

select tests.create_user(:anna, 'anna@test.se');
select tests.create_user(:bertil, 'bertil@test.se');
select tests.create_user(:cecilia, 'cecilia@test.se');
select tests.create_user(:dave, 'dave@test.se');
select tests.create_user(:erik, 'erik@test.se');

set role authenticated;
select tests.login(:anna);   select public.save_profile('Anna', 'v1');   select public.set_home('A 1', '12649', 'Hägersten', 59.30670, 18.00130, 'Aspudden');
select tests.login(:bertil); select public.save_profile('Bertil', 'v1'); select public.set_home('B 2', '12650', 'Hägersten', 59.30800, 18.00500, 'Aspudden');
select tests.login(:cecilia); select public.save_profile('Cecilia', 'v1'); select public.set_home('C 3', '12650', 'Hägersten', 59.30750, 18.00200, 'Aspudden');
select tests.login(:dave);   select public.save_profile('Dave', 'v1');   select public.set_home('D 4', '12649', 'Hägersten', 59.30500, 18.00300, 'Aspudden');
select tests.login(:erik);   select public.save_profile('Erik', 'v1');   select public.set_home('E 5', '12649', 'Hägersten', 59.30600, 18.00100, 'Aspudden');

-- Anna lägger upp tre saker
select tests.login(:anna);
insert into storage.objects (bucket_id, name, owner, owner_id)
select 'listing-photos', 'a0000000-0000-0000-0000-00000000000a/' || n || '.jpg', :anna, :anna
from unnest(array['k1', 'k1t', 'k2', 'k2t', 's1', 's1t', 't1', 't1t']) n;
select public.create_listing('clothes', 'like_new', 'a0000000-0000-0000-0000-00000000000a/k1.jpg', 'a0000000-0000-0000-0000-00000000000a/k1t.jpg', 'door',
  p_subcategory => 'Byxor', p_size_cm => 92, p_brand => 'Polarn O. Pyret', p_description => 'Mjuka mysbyxor') as byxor \gset
select public.create_listing('clothes', 'stained_ok', 'a0000000-0000-0000-0000-00000000000a/k2.jpg', 'a0000000-0000-0000-0000-00000000000a/k2t.jpg', 'door',
  p_subcategory => 'Tröjor', p_size_cm => 110) as trojor \gset
select public.create_listing('shoes', 'used_intact', 'a0000000-0000-0000-0000-00000000000a/s1.jpg', 'a0000000-0000-0000-0000-00000000000a/s1t.jpg', 'door',
  p_subcategory => 'Gummistövlar', p_shoe_size => 24, p_brand => 'Viking') as stovlar \gset
select public.create_listing('toys', 'used_intact', 'a0000000-0000-0000-0000-00000000000a/t1.jpg', 'a0000000-0000-0000-0000-00000000000a/t1t.jpg', 'door',
  p_subcategory => 'Bygg och pussel') as pussel \gset

-- ---------- Barn ----------
insert into public.children (nickname, birth_month, clothes_size_cm) values ('Elsa', date_trunc('month', now() - interval '20 months')::date, 92);
select tests.ok((select count(*) from public.children) = 1, 'föräldern ser sitt barn');
select tests.throws($$insert into public.children (parent_id, birth_month) values ('b0000000-0000-0000-0000-00000000000b', '2024-01-01')$$,
  'permission denied', 'kan inte lägga barn på någon annan');
select tests.login(:bertil);
select tests.ok((select count(*) from public.children) = 0, 'andra ser inte mina barn');

-- ---------- Filter ----------
select tests.ok((select count(*) from public.feed()) = 4, 'alla fyra syns utan filter');
select tests.ok((select count(*) from public.feed(p_category => 'clothes')) = 2, 'filter på kategori');
select tests.ok((select count(*) from public.feed(p_sizes_cm => array[92, 98])) = 1, 'strikt storleksfilter');
select tests.ok((select count(*) from public.feed(p_sizes_cm => array[92, 98], p_shoe_sizes => array[24, 25], p_size_strict => false)) = 3,
  'passar mina barn: rätt storlekar plus saker utan storlek');
select tests.ok((select count(*) from public.feed(p_conditions => array['like_new', 'used_intact'])) = 3, 'filter på skick');
select tests.ok((select count(*) from public.feed(p_brand => 'viking')) = 1, 'filter på varumärke (skiftlägesokänsligt)');
select tests.ok((select count(*) from public.feed(p_search => 'mysbyxor')) = 1, 'fritextsök i beskrivning');

-- ---------- Kö och 24-timmarsregel ----------
select public.request_listing(:'byxor') as bertil_req \gset
select tests.login(:cecilia);
select public.request_listing(:'byxor') as cecilia_req \gset
select tests.login(:anna);
select public.approve_request(:'bertil_req');

reset role;
update public.requests set pickup_deadline = now() - interval '1 minute' where id = :'bertil_req';
set role authenticated;

select tests.ok(public.expire_overdue_requests() = 1, 'en förfrågan har gått ut');
select tests.ok((select status from public.requests where id = :'bertil_req') = 'expired', 'förfrågan markeras som ej hämtad');
select tests.ok((select status from public.listings where id = :'byxor') = 'available', 'saken är ledig igen');
select tests.login(:cecilia);
select tests.ok((select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id
                 where c.taker_id = :cecilia and m.body like '%först i kön%') = 1, 'nästa i kön får besked');
select tests.login(:anna);
select tests.ok((select taker_no_shows from public.listing_requests(:'byxor') where taker_name = 'Cecilia') = 0, 'Cecilia har inga prickar');
select tests.ok((select reliability_pct from public.user_stats(:bertil)) = 0, 'Bertil får en prick (0 % pålitlig)');

-- Cecilia godkänns och hämtar
select public.approve_request(:'cecilia_req');
select tests.login(:cecilia);
select public.mark_picked_up(:'cecilia_req');
select tests.ok((select reliability_pct from public.user_stats(:cecilia)) = 100, 'Cecilia 100 % pålitlig');
select tests.ok((select received_count from public.user_stats(:cecilia)) = 1, 'Cecilia har hämtat 1');
select tests.ok((select given_count from public.user_stats(:anna)) = 1, 'Anna har bjussat 1');

-- ---------- Omdöme ----------
select tests.login(:bertil);
select tests.throws(format('select public.rate_pickup(%L, %L)', :'cecilia_req', 'as_described'), 'BJUSS_REQUEST_NOT_FOUND', 'bara mottagaren kan lämna omdöme');
select tests.login(:cecilia);
select public.rate_pickup(:'cecilia_req', 'as_described');
select tests.throws(format('select public.rate_pickup(%L, %L)', :'cecilia_req', 'not_quite'), 'BJUSS_ALREADY_RATED', 'bara ett omdöme');
select tests.ok((select rating_good from public.user_stats(:anna)) = 1 and (select rating_total from public.user_stats(:anna)) = 1,
  'Anna har 1 av 1 nöjda');

-- ---------- Blockera ----------
select tests.login(:dave);
select public.request_listing(:'stovlar') as dave_req \gset
select conversation_id as dave_conv from public.my_requests() where id = :'dave_req' \gset
select public.block_user(:anna);
select tests.ok((select status from public.requests where id = :'dave_req') = 'cancelled', 'blockering avslutar pågående förfrågan');
select tests.ok((select count(*) from public.feed()) = 0, 'blockerad persons annonser syns inte');
select tests.throws(format('select public.start_conversation(%L)', :'pussel'), 'BJUSS_LISTING_NOT_FOUND', 'kan inte chatta om blockerad persons annons');
select tests.throws(format($f$insert into public.messages (conversation_id, body) values (%L, 'hej')$f$, :'dave_conv'),
  'row-level security', 'kan inte skriva i gammal chatt efter blockering');
select tests.login(:anna);
select tests.throws(format($f$insert into public.messages (conversation_id, body) values (%L, 'hej')$f$, :'dave_conv'),
  'row-level security', 'den blockerade kan inte heller skriva');
select tests.login(:dave);
select tests.ok((select count(*) from public.my_blocks()) = 1, 'blockeringen syns i min lista');
select public.unblock_user(:anna);
select tests.ok((select count(*) from public.feed()) > 0, 'efter avblockering syns annonserna igen');
select tests.throws(format('select public.block_user(%L)', :dave), 'BJUSS_CANNOT_BLOCK_SELF', 'kan inte blockera sig själv');

-- ---------- Rapportera ----------
select public.report('inappropriate', p_listing_id => :'pussel');
select tests.login(:erik);
select public.report('spam', p_listing_id => :'pussel', p_details => 'Säljs på Blocket');
select tests.ok((select count(*) from public.feed() where id = :'pussel') = 1, 'två rapporter räcker inte för att dölja');
select tests.login(:bertil);
select public.report('not_free', p_listing_id => :'pussel');
select tests.ok((select count(*) from public.feed() where id = :'pussel') = 0, 'tre olika rapporter döljer annonsen');
select tests.ok((select count(*) from public.reports) = 1, 'man ser bara sina egna rapporter');
select tests.login(:anna);
select tests.ok((select count(*) from public.get_listing(:'pussel')) = 1, 'givaren ser fortfarande sin annons');

-- ---------- Adressbyten ----------
select tests.login(:erik);
select public.set_home('E 5', '12649', 'Hägersten', 59.30601, 18.00101, 'Aspudden');
select public.set_home('Ny 1', '11122', 'Stockholm', 59.33, 18.06, 'Norrmalm');
select public.set_home('Ny 2', '11122', 'Stockholm', 59.34, 18.07, 'Vasastan');
select public.set_home('Ny 3', '11122', 'Stockholm', 59.35, 18.08, 'Vasastan');
select tests.throws($$select public.set_home('Ny 4', '11122', 'Stockholm', 59.36, 18.09, 'Vasastan')$$,
  'BJUSS_ADDRESS_CHANGE_LIMIT', 'fjärde flytten på 30 dagar stoppas');
