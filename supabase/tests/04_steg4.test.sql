-- Steg 4: statistik, medaljpoäng, hämtningsgräns
\set anna   '''a0000000-0000-0000-0000-00000000000a'''
\set bertil '''b0000000-0000-0000-0000-00000000000b'''
\set cecilia '''c0000000-0000-0000-0000-00000000000c'''

select tests.create_user(:anna, 'anna@test.se');
select tests.create_user(:bertil, 'bertil@test.se');
select tests.create_user(:cecilia, 'cecilia@test.se');

reset role;
update public.app_settings set free_pickups = 2, monthly_pickup_limit = 3, max_open_requests = 50;

set role authenticated;
select tests.login(:anna);   select public.save_profile('Anna', 'v1');   select public.set_home('A 1', '12649', 'Hägersten', 59.30670, 18.00130, 'Aspudden', 'Stockholm');
select tests.login(:bertil); select public.save_profile('Bertil', 'v1'); select public.set_home('B 2', '12650', 'Hägersten', 59.30800, 18.00500, 'Aspudden', 'Stockholm');
select tests.login(:cecilia); select public.save_profile('Cecilia', 'v1'); select public.set_home('C 3', '12650', 'Hägersten', 59.30750, 18.00200, 'Aspudden', 'Stockholm');

-- Anna lägger upp 8 saker
select tests.login(:anna);
insert into storage.objects (bucket_id, name, owner, owner_id)
select 'listing-photos', 'a0000000-0000-0000-0000-00000000000a/' || n || '.jpg', :anna, :anna
from generate_series(1, 8) n;
create temp table ids (n int, listing uuid);
grant all on ids to authenticated;
insert into ids
select n, public.create_listing('clothes', 'like_new',
  'a0000000-0000-0000-0000-00000000000a/' || n || '.jpg', 'a0000000-0000-0000-0000-00000000000a/' || n || '.jpg', 'door',
  p_subcategory => 'Tröjor', p_size_cm => 98, p_quantity => 2)
from generate_series(1, 8) n;

-- Hjälpare: Bertil ber om sak n, Anna godkänner, Bertil hämtar
create function pg_temp.give(p_n int, p_taker uuid) returns void language plpgsql as $$
declare v_req uuid;
begin
  perform tests.login(p_taker);
  select public.request_listing((select listing from ids where n = p_n)) into v_req;
  perform tests.login('a0000000-0000-0000-0000-00000000000a');
  perform public.approve_request(v_req);
  perform tests.login(p_taker);
  perform public.mark_picked_up(v_req);
end $$;

-- Bertil: 2 gratis + 3 räknade = 5 hämtningar, sedan tar det stopp
select pg_temp.give(1, :bertil);
select pg_temp.give(2, :bertil);
select tests.login(:bertil);
select tests.ok((select used from public.my_pickup_status()) = 0, 'de två första hämtningarna räknas inte');
select tests.ok((select free_left from public.my_pickup_status()) = 0, 'inga gratis kvar');
select pg_temp.give(3, :bertil);
select pg_temp.give(4, :bertil);
select tests.login(:bertil);
select tests.ok((select used from public.my_pickup_status()) = 2, 'två räknade hämtningar');
select tests.ok(not (select reached from public.my_pickup_status()), 'gränsen inte nådd');
select pg_temp.give(5, :bertil);
select tests.login(:bertil);
select tests.ok((select reached from public.my_pickup_status()), 'gränsen nådd vid tre räknade');
select tests.throws(format('select public.request_listing(%L)', (select listing from ids where n = 6)), 'BJUSS_PICKUP_LIMIT',
  'kan inte be om fler när gränsen är nådd');

-- Godkänd men inte hämtad räknas också
select tests.login(:cecilia);
select public.request_listing((select listing from ids where n = 6)) as c6 \gset
select public.request_listing((select listing from ids where n = 7)) as c7 \gset
select public.request_listing((select listing from ids where n = 8)) as c8 \gset
select tests.login(:anna);
select public.approve_request(:'c6');
select public.approve_request(:'c7');
select tests.login(:cecilia);
select tests.ok((select free_left from public.my_pickup_status()) = 0, 'två godkända förbrukar de gratis hämtningarna');
select tests.login(:anna);
select public.approve_request(:'c8');
select tests.login(:cecilia);
select tests.ok((select used from public.my_pickup_status()) = 1, 'tredje godkända räknas mot gränsen');

-- ---------- Medaljpoäng ----------
select tests.login(:anna);
select tests.ok((select given_count from public.public_profile(:anna)) = 5, 'Anna har bjussat 5');
select tests.ok((select medal_points from public.public_profile(:anna)) = 2,
  'men bara 2 medaljpoäng eftersom alla gick till samma person samma månad');
select tests.ok((select unique_takers from public.public_profile(:anna)) = 1, 'en unik mottagare');
select tests.ok((select received_count from public.public_profile(:bertil)) = 5, 'Bertil har hämtat 5');

-- Obekräftade räknas inte
select public.mark_picked_up(:'c6');
select tests.ok((select given_count from public.public_profile(:anna)) = 5, 'givarens egen markering räknas inte som bjussning');
select tests.login(:cecilia);
select public.mark_picked_up(:'c6');
select tests.ok((select given_count from public.public_profile(:anna)) = 6, 'räknas när mottagaren bekräftat');
select tests.ok((select medal_points from public.public_profile(:anna)) = 3, 'ny mottagare ger nytt medaljpoäng');

-- ---------- Områdesstatistik ----------
reset role;
select tests.ok((select sum(pickups) from private.area_stats where area = 'Aspudden') = 6, 'områdesstatistiken summerar hämtningar');
select tests.ok((select sum(estimated_kg) from private.area_stats) = 2.4, 'uppskattad vikt (6 hämtningar x 2 tröjor x 0,2 kg)');
set role authenticated;
select tests.throws('select * from private.area_stats', 'permission denied', 'områdesstatistiken är inte öppen för appen');
