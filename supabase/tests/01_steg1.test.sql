-- Steg 1: profil, hem, annons, flöde, förfrågan, godkännande, chatt, hämtning, radering
\set anna   '''a0000000-0000-0000-0000-00000000000a'''
\set bertil '''b0000000-0000-0000-0000-00000000000b'''
\set cecilia '''c0000000-0000-0000-0000-00000000000c'''
\set dave   '''d0000000-0000-0000-0000-00000000000d'''

select tests.create_user(:anna, 'anna@test.se');
select tests.create_user(:bertil, 'bertil@test.se');
select tests.create_user(:cecilia, 'cecilia@test.se');
select tests.create_user(:dave, 'dave@test.se');

set role authenticated;

-- ---------- Profil och hem ----------
select tests.login(:anna);
select tests.throws($$select public.save_profile('Anna')$$, 'BJUSS_CONSENT_REQUIRED', 'profil kräver samtycke');
select public.save_profile('Anna', '2026-09-29');
select public.set_home('Aspuddsvägen 1', '12649', 'Hägersten', 59.30670, 18.00130, 'Aspudden', 'Stockholm');
select tests.ok((select postal_code from public.get_my_home()) = '126 49', 'postnummer normaliseras');
select tests.ok((select area_name from public.profiles where id = :anna) = 'Aspudden', 'område sparas på profilen');
select tests.throws($$select * from private.homes$$, 'permission denied', 'hemadresser kan inte läsas direkt');
select tests.throws($$select public.set_home('x', '123', 'y', 59.3, 18.0, 'Z')$$, 'BJUSS_BAD_POSTAL_CODE', 'fel postnummer stoppas');
select tests.throws($$select public.set_home('Rue 1', '75001', 'Paris', 48.85, 2.35, 'Paris')$$, 'BJUSS_OUTSIDE_SWEDEN', 'plats utanför Sverige stoppas');

select tests.login(:bertil);
select public.save_profile('Bertil', '2026-09-29');
select public.set_home('Hägerstensvägen 2', '126 50', 'Hägersten', 59.30800, 18.00500, 'Aspudden', 'Stockholm');
select tests.throws($$update public.profiles set display_name = 'Hack' where id = 'a0000000-0000-0000-0000-00000000000a'$$,
  'permission denied', 'kan inte ändra andras profil');

select tests.login(:cecilia);
select public.save_profile('Cecilia', '2026-09-29');
select public.set_home('Långt bort 3', '114 00', 'Stockholm', 59.33000, 18.05000, 'Östermalm', 'Stockholm');

select tests.login(:dave);
select public.save_profile('Dave', '2026-09-29');
select public.set_home('Nära 4', '126 49', 'Hägersten', 59.30500, 18.00300, 'Aspudden', 'Stockholm');

-- ---------- Bilder ----------
select tests.login(:anna);
insert into storage.objects (bucket_id, name, owner, owner_id)
values ('listing-photos', 'a0000000-0000-0000-0000-00000000000a/p1.jpg', :anna, :anna),
       ('listing-photos', 'a0000000-0000-0000-0000-00000000000a/p1_thumb.jpg', :anna, :anna);
select tests.throws($$insert into storage.objects (bucket_id, name) values ('listing-photos', 'b0000000-0000-0000-0000-00000000000b/x.jpg')$$,
  'row-level security', 'kan inte ladda upp i någon annans mapp');

-- ---------- Annons ----------
select tests.throws($$select public.create_listing('clothes', 'like_new', 'b0000000-0000-0000-0000-00000000000b/x.jpg', 'b0000000-0000-0000-0000-00000000000b/x.jpg', 'door')$$,
  'BJUSS_BAD_PHOTO', 'måste använda egen uppladdad bild');
select public.create_listing(
  p_category => 'clothes', p_condition => 'like_new',
  p_photo_path => 'a0000000-0000-0000-0000-00000000000a/p1.jpg',
  p_thumb_path => 'a0000000-0000-0000-0000-00000000000a/p1_thumb.jpg',
  p_pickup_method => 'door', p_subcategory => 'Overaller och ytterkläder', p_size_cm => 92,
  p_quantity => 1, p_brand => 'Polarn O. Pyret', p_door_code => '1234', p_instructions => 'Kassen hänger på dörren, 3 tr'
) as listing_id \gset
select tests.throws($$select public.create_listing('clothes', 'like_new', 'a0000000-0000-0000-0000-00000000000a/p1.jpg', 'a0000000-0000-0000-0000-00000000000a/p1_thumb.jpg', 'home', p_pickup_from => now() - interval '3 hours', p_pickup_to => now() - interval '1 hour')$$,
  'BJUSS_PICKUP_WINDOW_PAST', 'tidsfönster i det förflutna stoppas');
select tests.throws($$insert into public.listings (giver_id, category, condition, photo_path, thumb_path, pickup_method) values ('a0000000-0000-0000-0000-00000000000a', 'toys', 'like_new', 'x', 'y', 'door')$$,
  'permission denied', 'annonser kan bara skapas via funktionen');
select tests.ok((select count(*) from public.feed()) = 0, 'egna annonser syns inte i eget flöde');
select tests.ok((select is_mine from public.get_listing(:'listing_id')), 'givaren ser sin annons');

-- ---------- Flödet ----------
select tests.login(:bertil);
select tests.ok((select count(*) from public.feed()) = 1, 'granne 300 m bort ser annonsen');
select tests.ok((select distance_m from public.feed() limit 1) between 100 and 500
             and (select distance_m from public.feed() limit 1) % 100 = 0, 'avståndet är avrundat till hundratal');
select tests.ok((select area_name from public.feed() limit 1) = 'Aspudden', 'området visas');
select tests.ok(not exists (select 1 from public.get_pickup_details(
  (select id from public.requests limit 1))), 'ingen adress före förfrågan');

select tests.login(:cecilia);
select tests.ok((select count(*) from public.feed()) = 0, 'någon 4 km bort ser inte annonsen');
select tests.ok((select count(*) from public.get_listing(:'listing_id')) = 0, 'någon långt bort kan inte öppna annonsen');
select tests.ok((select count(*) from public.listings) = 0, 'någon långt bort kan inte läsa tabellen direkt');
select tests.ok((select count(*) from storage.objects where bucket_id = 'listing-photos') = 0, 'någon långt bort ser inte bilderna');
select tests.throws(format('select public.request_listing(%L)', :'listing_id'), 'BJUSS_LISTING_NOT_FOUND', 'någon långt bort kan inte be om saken');
select tests.throws(format('select public.start_conversation(%L)', :'listing_id'), 'BJUSS_LISTING_NOT_FOUND', 'någon långt bort kan inte starta chatt');

-- ---------- Förfrågan ----------
select tests.login(:bertil);
select tests.ok((select count(*) from storage.objects where bucket_id = 'listing-photos') = 2, 'grannen får se bilderna');
select public.request_listing(:'listing_id') as bertil_req \gset
select tests.throws(format('select public.request_listing(%L)', :'listing_id'), 'BJUSS_ALREADY_REQUESTED', 'kan inte be två gånger');
select tests.ok((select my_request_status from public.get_listing(:'listing_id')) = 'pending', 'min förfrågan syns på annonsen');
select tests.ok((select my_queue_position from public.get_listing(:'listing_id')) = 1, 'jag är först i kön');
select tests.throws(format('select public.approve_request(%L)', :'bertil_req'), 'BJUSS_REQUEST_NOT_FOUND', 'mottagaren kan inte godkänna sig själv');
select tests.ok(not exists (select 1 from public.get_pickup_details(:'bertil_req')), 'ingen adress innan godkännande');

select tests.login(:dave);
select public.request_listing(:'listing_id') as dave_req \gset
select tests.ok((select my_queue_position from public.get_listing(:'listing_id')) = 2, 'Dave är tvåa i kön');

select tests.login(:anna);
select tests.throws(format('select public.request_listing(%L)', :'listing_id'), 'BJUSS_OWN_LISTING', 'kan inte be om sin egen sak');
select tests.ok((select count(*) from public.listing_requests(:'listing_id')) = 2, 'givaren ser båda i kön');
select tests.ok((select taker_name from public.listing_requests(:'listing_id') limit 1) = 'Bertil', 'kön är i tidsordning');
select tests.ok((select pending_count from public.my_listings() where id = :'listing_id') = 2, 'antal i kön på Mina bjussningar');

-- ---------- Chatt före godkännande ----------
select tests.login(:bertil);
select conversation_id as conv from public.my_requests() where id = :'bertil_req' \gset
insert into public.messages (conversation_id, body) values (:'conv', 'Hej! Är overallen hel?');
select tests.throws(format($f$insert into public.messages (conversation_id, body, sender_id) values (%L, 'fejk', %L)$f$, :'conv', :anna),
  'permission denied', 'kan inte skicka i någon annans namn');

select tests.login(:anna);
select tests.ok((select unread from public.my_conversations() where id = :'conv'), 'givaren har oläst meddelande');
select tests.ok(public.unread_count() = 2, 'två olästa konversationer (Bertil och Dave)');
select public.mark_conversation_read(:'conv');
select tests.ok(not (select unread from public.my_conversations() where id = :'conv'), 'markerad som läst');
insert into public.messages (conversation_id, body) values (:'conv', 'Ja, helt hel! Mitt tel: 070-123 45 67');

select tests.login(:cecilia);
select tests.ok((select count(*) from public.messages) = 0, 'utomstående kan inte läsa chatten');
select tests.throws(format($f$insert into public.messages (conversation_id, body) values (%L, 'intrång')$f$, :'conv'),
  'row-level security', 'utomstående kan inte skriva i chatten');

-- ---------- Godkännande ----------
select tests.login(:anna);
select public.approve_request(:'bertil_req');
select tests.ok((select status from public.get_listing(:'listing_id')) = 'reserved', 'annonsen blir reserverad');
select tests.ok((select pickup_deadline from public.requests where id = :'bertil_req') > now() + interval '23 hours', 'hämtas inom 24 timmar');
select tests.throws(format('select public.approve_request(%L)', :'dave_req'), 'BJUSS_LISTING_NOT_AVAILABLE', 'kan bara godkänna en åt gången');

select tests.login(:bertil);
select tests.ok((select street_address from public.get_pickup_details(:'bertil_req')) = 'Aspuddsvägen 1', 'godkänd mottagare ser adressen');
select tests.ok((select door_code from public.get_pickup_details(:'bertil_req')) = '1234', 'godkänd mottagare ser portkoden');
select tests.ok((select count(*) from public.messages where conversation_id = :'conv' and kind = 'system' and body like '%godkänt%') = 1, 'systemmeddelande om godkännande');
select tests.ok((select count(*) from public.feed()) = 0, 'reserverad annons syns inte i flödet');
select tests.ok((select count(*) from public.get_listing(:'listing_id')) = 1, 'men mottagaren kan fortfarande öppna den');

select tests.login(:dave);
select tests.ok(not exists (select 1 from public.get_pickup_details(:'bertil_req')), 'den som står i kö ser inte adressen');
select tests.ok(not exists (select 1 from public.get_pickup_details(:'dave_req')), 'inte heller via sin egen förfrågan');

select tests.login(:cecilia);
select tests.ok(not exists (select 1 from public.get_pickup_details(:'bertil_req')), 'utomstående ser inte adressen');

-- ---------- Ångra och godkänn igen ----------
select tests.login(:anna);
select public.decline_request(:'bertil_req');
select tests.ok((select status from public.get_listing(:'listing_id')) = 'available', 'ångrat godkännande gör annonsen ledig');
select tests.login(:bertil);
select public.request_listing(:'listing_id') as bertil_req \gset
select tests.login(:anna);
select public.approve_request(:'bertil_req');

-- ---------- Hämtning ----------
select tests.login(:dave);
select tests.throws(format('select public.mark_picked_up(%L)', :'bertil_req'), 'BJUSS_REQUEST_NOT_FOUND', 'utomstående kan inte markera hämtat');
select tests.login(:bertil);
select public.mark_picked_up(:'bertil_req');
select tests.ok((select status from public.requests where id = :'bertil_req') = 'picked_up', 'förfrågan hämtad');
select tests.ok((select taker_confirmed from public.requests where id = :'bertil_req'), 'mottagaren har bekräftat');
select tests.ok(not exists (select 1 from public.get_pickup_details(:'bertil_req')), 'adressen döljs efter hämtning');
select tests.login(:dave);
select tests.ok((select status from public.requests where id = :'dave_req') = 'declined', 'resten av kön får nej');
select tests.ok((select close_reason from public.requests where id = :'dave_req') = 'taken_by_other', 'med rätt anledning');

-- ---------- Givaren markerar, mottagaren bekräftar i efterhand ----------
select tests.login(:anna);
insert into storage.objects (bucket_id, name, owner, owner_id)
values ('listing-photos', 'a0000000-0000-0000-0000-00000000000a/p2.jpg', :anna, :anna),
       ('listing-photos', 'a0000000-0000-0000-0000-00000000000a/p2_thumb.jpg', :anna, :anna);
select public.create_listing('toys', 'used_intact', 'a0000000-0000-0000-0000-00000000000a/p2.jpg',
  'a0000000-0000-0000-0000-00000000000a/p2_thumb.jpg', 'home',
  p_pickup_from => now() + interval '1 hour', p_pickup_to => now() + interval '3 hours') as listing2 \gset
select tests.login(:dave);
select public.request_listing(:'listing2') as dave_req2 \gset
select tests.login(:anna);
select public.approve_request(:'dave_req2');
select public.mark_picked_up(:'dave_req2');
select tests.ok(not (select taker_confirmed from public.requests where id = :'dave_req2'), 'givarens markering räknas inte som bekräftad');
select tests.login(:dave);
select public.mark_picked_up(:'dave_req2');
select tests.ok((select taker_confirmed from public.requests where id = :'dave_req2'), 'mottagaren kan bekräfta i efterhand');

-- ---------- Ta bort annons ----------
select tests.login(:anna);
insert into storage.objects (bucket_id, name, owner, owner_id)
values ('listing-photos', 'a0000000-0000-0000-0000-00000000000a/p3.jpg', :anna, :anna),
       ('listing-photos', 'a0000000-0000-0000-0000-00000000000a/p3_thumb.jpg', :anna, :anna);
select public.create_listing('books_games', 'stained_ok', 'a0000000-0000-0000-0000-00000000000a/p3.jpg',
  'a0000000-0000-0000-0000-00000000000a/p3_thumb.jpg', 'door') as listing3 \gset
select tests.login(:bertil);
select public.request_listing(:'listing3') as bertil_req3 \gset
select tests.login(:bertil);
select tests.throws(format('select public.remove_listing(%L)', :'listing3'), 'BJUSS_LISTING_NOT_FOUND', 'bara givaren kan ta bort');
select tests.login(:anna);
select public.remove_listing(:'listing3');
select tests.login(:bertil);
select tests.ok((select close_reason from public.requests where id = :'bertil_req3') = 'listing_removed', 'kön får besked när annonsen tas bort');

-- ---------- Anonyma ----------
select tests.login(null);
set role anon;
select tests.throws('select * from public.feed()', 'permission denied', 'anonyma kan inte läsa flödet');
select tests.throws('select * from public.profiles', 'permission denied', 'anonyma kan inte läsa profiler');
set role authenticated;

-- ---------- Radera konto ----------
select tests.login(:bertil);
select public.delete_my_account();
reset role;
select tests.ok(not exists (select 1 from auth.users where id = :bertil), 'kontot är raderat');
select tests.ok(not exists (select 1 from public.profiles where id = :bertil), 'profilen är raderad');
select tests.ok(not exists (select 1 from private.homes where user_id = :bertil), 'adressen är raderad');
select tests.ok((select taker_id from public.requests where id = :'bertil_req') is null, 'Annas statistik finns kvar men utan Bertil');
select tests.ok(not exists (select 1 from public.conversations where taker_id = :bertil), 'Bertils chattar är raderade');
