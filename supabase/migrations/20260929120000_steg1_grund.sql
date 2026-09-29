-- =====================================================================
-- Bjuss – steg 1: grunden
--   profiler, hemadress (privat), annonser, förfrågningar, chatt,
--   flöde inom radie med ungefärligt avstånd, bildlagring.
--
-- Säkerhetsprinciper:
--   * Row Level Security (RLS) är påslaget på alla tabeller.
--   * Exakt adress och GPS-punkt ligger i schemat "private", som appen
--     inte kan läsa direkt. De lämnas bara ut via funktioner som kontrollerar
--     att den som frågar är godkänd mottagare.
--   * Alla statusbyten (godkänn, neka, hämtat …) sker via funktioner som
--     kontrollerar reglerna, inte via fria uppdateringar från appen.
-- =====================================================================

create extension if not exists postgis with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
-- Inloggade får "gå in i" schemat för att kunna köra de få hjälpfunktioner
-- som säkerhetsreglerna använder, men har inga rättigheter på tabellerna.
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Inställningar (ändras i Supabase: Table Editor -> app_settings)
-- ---------------------------------------------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  feed_radius_m integer not null default 500 check (feed_radius_m between 50 and 50000),
  pickup_hours integer not null default 24 check (pickup_hours between 1 and 336),
  max_open_requests integer not null default 10 check (max_open_requests between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.app_settings default values;
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
create policy "Inloggade kan läsa inställningarna" on public.app_settings
  for select to authenticated using (true);
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;

create function private.settings() returns public.app_settings
language sql stable security definer set search_path = '' as $$
  select * from public.app_settings where id
$$;

-- ---------------------------------------------------------------------
-- Profiler (det andra inloggade får se: namn och område)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  area_name text check (char_length(area_name) <= 80),
  area_city text check (char_length(area_city) <= 80),
  consent_at timestamptz not null,
  privacy_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
create policy "Inloggade kan se profiler" on public.profiles
  for select to authenticated using (true);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------
-- Hem (PRIVAT: gatuadress och exakt position)
-- ---------------------------------------------------------------------
create table private.homes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  street_address text not null check (char_length(street_address) between 2 and 120),
  postal_code text not null check (postal_code ~ '^[0-9]{3} [0-9]{2}$'),
  city text not null check (char_length(city) between 1 and 80),
  location extensions.geography(point, 4326) not null,
  -- Avrundad position (rutnät på ca 200 m). Används för att visa
  -- ungefärligt avstånd utan att avslöja var någon bor.
  approx_location extensions.geography(point, 4326) not null,
  updated_at timestamptz not null default now()
);
create index homes_location_idx on private.homes using gist (location);
alter table private.homes enable row level security;

create function private.snap_to_grid(p_lat double precision, p_lng double precision)
returns extensions.geography
language sql immutable set search_path = '' as $$
  -- 0,0018 grader latitud ≈ 200 m, 0,0036 grader longitud ≈ 200 m i Mellansverige
  select extensions.st_setsrid(
    extensions.st_makepoint(
      (floor(p_lng / 0.0036) + 0.5) * 0.0036,
      (floor(p_lat / 0.0018) + 0.5) * 0.0018
    ), 4326)::extensions.geography
$$;

-- ---------------------------------------------------------------------
-- Annonser
-- ---------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  giver_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('clothes', 'shoes', 'gear', 'toys', 'books_games', 'bikes_sports')),
  subcategory text check (char_length(subcategory) <= 60),
  size_cm smallint check (size_cm between 40 and 190),
  shoe_size smallint check (shoe_size between 15 and 45),
  condition text not null check (condition in ('like_new', 'used_intact', 'stained_ok')),
  quantity smallint not null default 1 check (quantity between 1 and 200),
  brand text check (char_length(brand) <= 60),
  description text check (char_length(description) <= 500),
  photo_path text not null,
  thumb_path text not null,
  pickup_method text not null check (pickup_method in ('door', 'home')),
  pickup_from timestamptz,
  pickup_to timestamptz,
  status text not null default 'available' check (status in ('available', 'reserved', 'picked_up', 'removed')),
  area_name text,
  area_city text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  constraint pickup_window_ok check (
    pickup_method = 'door' or (pickup_from is not null and pickup_to is not null and pickup_to > pickup_from)
  )
);
create index listings_status_created_idx on public.listings (status, created_at desc);
create index listings_giver_idx on public.listings (giver_id, created_at desc);
alter table public.listings enable row level security;
revoke all on public.listings from anon, authenticated;

-- PRIVAT: portkod och instruktion för "Kasse på dörren"
create table private.listing_secrets (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  door_code text check (char_length(door_code) <= 40),
  instructions text check (char_length(instructions) <= 300)
);
alter table private.listing_secrets enable row level security;

-- ---------------------------------------------------------------------
-- Förfrågningar ("Vill ha")
-- ---------------------------------------------------------------------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  giver_id uuid not null references public.profiles (id) on delete cascade,
  taker_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'picked_up', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default clock_timestamp(),
  approved_at timestamptz,
  pickup_deadline timestamptz,
  picked_up_at timestamptz,
  picked_up_marked_by text check (picked_up_marked_by in ('taker', 'giver')),
  -- En bjussning räknas först när mottagaren själv bekräftat hämtningen.
  taker_confirmed boolean not null default false,
  closed_at timestamptz,
  close_reason text check (close_reason in ('giver_declined', 'giver_undid', 'taken_by_other', 'listing_removed', 'taker_cancelled', 'expired'))
);
create unique index requests_one_active_per_taker on public.requests (listing_id, taker_id)
  where status in ('pending', 'approved');
create unique index requests_one_approved_per_listing on public.requests (listing_id)
  where status = 'approved';
create index requests_taker_idx on public.requests (taker_id, status);
create index requests_giver_idx on public.requests (giver_id, status);
create index requests_listing_idx on public.requests (listing_id, created_at);
alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
create policy "Se förfrågningar man är part i" on public.requests
  for select to authenticated
  using (taker_id = (select auth.uid()) or giver_id = (select auth.uid()));
grant select on public.requests to authenticated;
grant all on public.requests to service_role;

-- ---------------------------------------------------------------------
-- Chatt: en konversation per annons och intresserad person
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  giver_id uuid not null references public.profiles (id) on delete cascade,
  taker_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  giver_read_at timestamptz,
  taker_read_at timestamptz,
  unique (listing_id, taker_id)
);
create index conversations_giver_idx on public.conversations (giver_id, last_message_at desc);
create index conversations_taker_idx on public.conversations (taker_id, last_message_at desc);
alter table public.conversations enable row level security;
revoke all on public.conversations from anon, authenticated;
create policy "Se egna konversationer" on public.conversations
  for select to authenticated
  using (giver_id = (select auth.uid()) or taker_id = (select auth.uid()));
grant select on public.conversations to authenticated;
grant all on public.conversations to service_role;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null default 'user' check (kind in ('user', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;

-- ---------------------------------------------------------------------
-- Hjälpfunktioner som säkerhetsreglerna använder
-- ---------------------------------------------------------------------

-- Blockering införs i steg 2; här finns en tom version så att allt annat
-- redan nu frågar "är de här två blockerade?".
create function private.blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select false
$$;

create function private.is_near(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from private.homes me
    join private.homes other on other.user_id = p_other
    where me.user_id = auth.uid()
      and extensions.st_dwithin(me.location, other.location, (private.settings()).feed_radius_m)
  )
$$;

create function private.can_see_listing(p_listing_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and (
        l.giver_id = auth.uid()
        or exists (select 1 from public.requests r where r.listing_id = l.id and r.taker_id = auth.uid())
        or exists (select 1 from public.conversations c where c.listing_id = l.id and c.taker_id = auth.uid())
        or (
          l.status = 'available'
          and private.is_near(l.giver_id)
          and not private.blocked_between(auth.uid(), l.giver_id)
        )
      )
  )
$$;

create function private.is_participant(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and auth.uid() in (c.giver_id, c.taker_id)
  )
$$;

create function private.conversation_blocked(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select private.blocked_between(c.giver_id, c.taker_id)
    from public.conversations c where c.id = p_conversation_id
  ), false)
$$;

create function private.can_see_photo(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.listings l
    where (l.photo_path = p_name or l.thumb_path = p_name)
      and private.can_see_listing(l.id)
  )
$$;

create function private.display_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'En raderad användare')
$$;

create function private.round_distance(p_meters double precision) returns integer
language sql stable set search_path = '' as $$
  select least(
    greatest(100, (round(p_meters / 100.0) * 100)::integer),
    (private.settings()).feed_radius_m
  )
$$;

-- Stockholmstid i systemmeddelanden, t.ex. "30/9 kl. 18:00"
create function private.fmt_time(p_ts timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p_ts at time zone 'Europe/Stockholm', 'FMDD/FMMM "kl." HH24:MI')
$$;


-- RLS för annonser och meddelanden (använder hjälpfunktionerna ovan)
create policy "Se annonser man har rätt att se" on public.listings
  for select to authenticated using (private.can_see_listing(id));
grant select on public.listings to authenticated;
grant all on public.listings to service_role;

create policy "Läsa meddelanden i egna konversationer" on public.messages
  for select to authenticated using (private.is_participant(conversation_id));
create policy "Skriva meddelanden i egna konversationer" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind = 'user'
    and private.is_participant(conversation_id)
    and not private.conversation_blocked(conversation_id)
  );
grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;
grant all on public.messages to service_role;

-- Håll konversationens "senaste meddelande" uppdaterat
create function private.on_message_inserted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 120),
         last_sender_id = new.sender_id,
         giver_read_at = case when new.sender_id = giver_id then new.created_at else giver_read_at end,
         taker_read_at = case when new.sender_id = taker_id then new.created_at else taker_read_at end
   where id = new.conversation_id;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function private.on_message_inserted();

create function private.system_message(p_conversation_id uuid, p_body text) returns void
language sql security definer set search_path = '' as $$
  insert into public.messages (conversation_id, sender_id, kind, body)
  values (p_conversation_id, null, 'system', p_body)
$$;

create function private.ensure_conversation(p_listing_id uuid, p_taker_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.conversations (listing_id, giver_id, taker_id)
  select l.id, l.giver_id, p_taker_id from public.listings l where l.id = p_listing_id
  on conflict (listing_id, taker_id) do nothing;
  select id into v_id from public.conversations where listing_id = p_listing_id and taker_id = p_taker_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Profil och hem
-- ---------------------------------------------------------------------
create function public.save_profile(p_display_name text, p_accept_privacy_version text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  if exists (select 1 from public.profiles where id = v_uid) then
    update public.profiles set display_name = btrim(p_display_name), updated_at = now() where id = v_uid;
  else
    if p_accept_privacy_version is null then raise exception 'BJUSS_CONSENT_REQUIRED'; end if;
    insert into public.profiles (id, display_name, consent_at, privacy_version)
    values (v_uid, btrim(p_display_name), now(), p_accept_privacy_version);
  end if;
end $$;

create function public.set_home(
  p_street_address text,
  p_postal_code text,
  p_city text,
  p_lat double precision,
  p_lng double precision,
  p_area_name text,
  p_area_city text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_postal text := regexp_replace(coalesce(p_postal_code, ''), '[^0-9]', '', 'g');
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'BJUSS_NO_PROFILE'; end if;
  if length(v_postal) <> 5 then raise exception 'BJUSS_BAD_POSTAL_CODE'; end if;
  if p_lat is null or p_lng is null or p_lat not between 55.0 and 69.2 or p_lng not between 10.5 and 24.5 then
    raise exception 'BJUSS_OUTSIDE_SWEDEN';
  end if;
  if nullif(btrim(p_area_name), '') is null then raise exception 'BJUSS_AREA_REQUIRED'; end if;

  insert into private.homes (user_id, street_address, postal_code, city, location, approx_location, updated_at)
  values (
    v_uid, btrim(p_street_address), substr(v_postal, 1, 3) || ' ' || substr(v_postal, 4, 2), btrim(p_city),
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
    private.snap_to_grid(p_lat, p_lng), now()
  )
  on conflict (user_id) do update set
    street_address = excluded.street_address,
    postal_code = excluded.postal_code,
    city = excluded.city,
    location = excluded.location,
    approx_location = excluded.approx_location,
    updated_at = now();

  update public.profiles
     set area_name = btrim(p_area_name), area_city = nullif(btrim(p_area_city), ''), updated_at = now()
   where id = v_uid;
end $$;

create function public.get_my_home()
returns table (street_address text, postal_code text, city text, lat double precision, lng double precision)
language sql stable security definer set search_path = '' as $$
  select h.street_address, h.postal_code, h.city,
         extensions.st_y(h.location::extensions.geometry), extensions.st_x(h.location::extensions.geometry)
  from private.homes h where h.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Annonser
-- ---------------------------------------------------------------------
create function public.create_listing(
  p_category text,
  p_condition text,
  p_photo_path text,
  p_thumb_path text,
  p_pickup_method text,
  p_subcategory text default null,
  p_size_cm integer default null,
  p_shoe_size integer default null,
  p_quantity integer default 1,
  p_brand text default null,
  p_description text default null,
  p_pickup_from timestamptz default null,
  p_pickup_to timestamptz default null,
  p_door_code text default null,
  p_instructions text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_id uuid;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'BJUSS_NO_PROFILE'; end if;
  if not exists (select 1 from private.homes where user_id = v_uid) then raise exception 'BJUSS_NO_HOME'; end if;
  if split_part(p_photo_path, '/', 1) <> v_uid::text or split_part(p_thumb_path, '/', 1) <> v_uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'listing-photos' and o.name = p_photo_path)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'listing-photos' and o.name = p_thumb_path) then
    raise exception 'BJUSS_BAD_PHOTO';
  end if;
  if p_pickup_method = 'home' and (p_pickup_to is null or p_pickup_to <= now()) then
    raise exception 'BJUSS_PICKUP_WINDOW_PAST';
  end if;

  insert into public.listings (
    giver_id, category, subcategory, size_cm, shoe_size, condition, quantity, brand, description,
    photo_path, thumb_path, pickup_method, pickup_from, pickup_to, area_name, area_city
  ) values (
    v_uid, p_category, nullif(btrim(p_subcategory), ''), p_size_cm, p_shoe_size, p_condition,
    coalesce(p_quantity, 1), nullif(btrim(p_brand), ''), nullif(btrim(p_description), ''),
    p_photo_path, p_thumb_path, p_pickup_method,
    case when p_pickup_method = 'home' then p_pickup_from end,
    case when p_pickup_method = 'home' then p_pickup_to end,
    v_profile.area_name, v_profile.area_city
  ) returning id into v_id;

  if p_pickup_method = 'door'
     and (nullif(btrim(p_door_code), '') is not null or nullif(btrim(p_instructions), '') is not null) then
    insert into private.listing_secrets (listing_id, door_code, instructions)
    values (v_id, nullif(btrim(p_door_code), ''), nullif(btrim(p_instructions), ''));
  end if;
  return v_id;
end $$;

create function public.remove_listing(p_listing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_l public.listings; v_r record;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or v_l.giver_id <> v_uid then raise exception 'BJUSS_LISTING_NOT_FOUND'; end if;
  if v_l.status not in ('available', 'reserved') then raise exception 'BJUSS_LISTING_NOT_AVAILABLE'; end if;
  update public.listings set status = 'removed', updated_at = now() where id = p_listing_id;
  for v_r in
    update public.requests set status = 'declined', closed_at = now(), close_reason = 'listing_removed'
     where listing_id = p_listing_id and status in ('pending', 'approved')
     returning taker_id
  loop
    if v_r.taker_id is not null then
      perform private.system_message(
        private.ensure_conversation(p_listing_id, v_r.taker_id),
        'Annonsen har tagits bort av ' || private.display_name(v_uid) || '.'
      );
    end if;
  end loop;
end $$;

-- En rad i flödet / på annonssidan. Används av feed() och get_listing().
create type public.listing_view as (
  id uuid,
  giver_id uuid,
  giver_name text,
  category text,
  subcategory text,
  size_cm smallint,
  shoe_size smallint,
  condition text,
  quantity smallint,
  brand text,
  description text,
  photo_path text,
  thumb_path text,
  pickup_method text,
  pickup_from timestamptz,
  pickup_to timestamptz,
  status text,
  area_name text,
  area_city text,
  created_at timestamptz,
  distance_m integer,
  is_mine boolean,
  my_request_id uuid,
  my_request_status text,
  my_queue_position integer,
  my_conversation_id uuid,
  queue_length integer
);

create function private.listing_view(p_listing public.listings) returns public.listing_view
language sql stable security definer set search_path = '' as $$
  select
    l.id, l.giver_id, p.display_name, l.category, l.subcategory, l.size_cm, l.shoe_size, l.condition,
    l.quantity, l.brand, l.description, l.photo_path, l.thumb_path, l.pickup_method, l.pickup_from,
    l.pickup_to, l.status, l.area_name, l.area_city, l.created_at,
    case when l.giver_id = auth.uid() then null else (
      select private.round_distance(extensions.st_distance(me.location, gh.approx_location))
      from private.homes me, private.homes gh
      where me.user_id = auth.uid() and gh.user_id = l.giver_id
    ) end,
    l.giver_id = auth.uid(),
    mr.id,
    mr.status,
    case when mr.status = 'pending' then (
      select count(*)::integer + 1 from public.requests q
      where q.listing_id = l.id and q.status = 'pending' and q.created_at < mr.created_at
    ) end,
    (select c.id from public.conversations c where c.listing_id = l.id and c.taker_id = auth.uid()),
    (select count(*)::integer from public.requests q where q.listing_id = l.id and q.status = 'pending')
  from (select p_listing.*) l
  join public.profiles p on p.id = l.giver_id
  left join lateral (
    select r.id, r.status, r.created_at from public.requests r
    where r.listing_id = l.id and r.taker_id = auth.uid()
    order by r.created_at desc limit 1
  ) mr on true
$$;

create function public.get_listing(p_listing_id uuid) returns setof public.listing_view
language sql stable security definer set search_path = '' as $$
  select (private.listing_view(l)).*
  from public.listings l
  where l.id = p_listing_id and private.can_see_listing(l.id)
$$;

create function public.feed(p_limit integer default 30, p_before timestamptz default null)
returns setof public.listing_view
language sql stable security definer set search_path = '' as $$
  select (private.listing_view(l)).*
  from private.homes me
  join private.homes gh
    on extensions.st_dwithin(me.location, gh.location, (private.settings()).feed_radius_m)
  join public.listings l on l.giver_id = gh.user_id
  where me.user_id = auth.uid()
    and l.giver_id <> auth.uid()
    and l.status = 'available'
    and not private.blocked_between(auth.uid(), l.giver_id)
    and (p_before is null or l.created_at < p_before)
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------
-- Förfrågningar och hämtning
-- ---------------------------------------------------------------------

-- Kontroller som skärps i senare steg (hämtningsgräns i steg 4)
create function private.assert_can_request(p_taker uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select count(*) from public.requests where taker_id = p_taker and status = 'pending')
     >= (private.settings()).max_open_requests then
    raise exception 'BJUSS_TOO_MANY_OPEN_REQUESTS';
  end if;
end $$;

create function private.assert_can_be_approved(p_taker uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform p_taker;
end $$;

create function public.request_listing(p_listing_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_l public.listings; v_id uuid; v_conv uuid;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  if not exists (select 1 from private.homes where user_id = v_uid) then raise exception 'BJUSS_NO_HOME'; end if;
  select * into v_l from public.listings where id = p_listing_id for update;
  if not found or not private.can_see_listing(p_listing_id) then raise exception 'BJUSS_LISTING_NOT_FOUND'; end if;
  if v_l.giver_id = v_uid then raise exception 'BJUSS_OWN_LISTING'; end if;
  if private.blocked_between(v_uid, v_l.giver_id) then raise exception 'BJUSS_BLOCKED'; end if;
  if v_l.status <> 'available' then raise exception 'BJUSS_LISTING_NOT_AVAILABLE'; end if;
  if exists (select 1 from public.requests where listing_id = p_listing_id and taker_id = v_uid
             and status in ('pending', 'approved')) then
    raise exception 'BJUSS_ALREADY_REQUESTED';
  end if;
  perform private.assert_can_request(v_uid);

  insert into public.requests (listing_id, giver_id, taker_id)
  values (p_listing_id, v_l.giver_id, v_uid) returning id into v_id;

  v_conv := private.ensure_conversation(p_listing_id, v_uid);
  perform private.system_message(v_conv, private.display_name(v_uid) || ' vill ha den här och har ställt sig i kön.');
  return v_id;
end $$;

create function public.approve_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.requests; v_l public.listings; v_deadline timestamptz;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_r from public.requests where id = p_request_id for update;
  if not found or v_r.giver_id <> v_uid then raise exception 'BJUSS_REQUEST_NOT_FOUND'; end if;
  if v_r.status <> 'pending' then raise exception 'BJUSS_REQUEST_NOT_PENDING'; end if;
  if v_r.taker_id is null then raise exception 'BJUSS_USER_GONE'; end if;
  select * into v_l from public.listings where id = v_r.listing_id for update;
  if v_l.status <> 'available' then raise exception 'BJUSS_LISTING_NOT_AVAILABLE'; end if;
  perform private.assert_can_be_approved(v_r.taker_id);

  v_deadline := greatest(
    now() + make_interval(hours => (private.settings()).pickup_hours),
    coalesce(v_l.pickup_to, now())
  );
  update public.requests
     set status = 'approved', approved_at = now(), pickup_deadline = v_deadline
   where id = p_request_id;
  update public.listings set status = 'reserved', updated_at = now() where id = v_l.id;

  perform private.system_message(
    private.ensure_conversation(v_l.id, v_r.taker_id),
    private.display_name(v_uid) || ' har godkänt förfrågan! Adress och hämtningsinfo syns nu överst i chatten. '
      || 'Hämta senast ' || private.fmt_time(v_deadline) || '.'
  );
end $$;

create function public.decline_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.requests;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_r from public.requests where id = p_request_id for update;
  if not found or v_r.giver_id <> v_uid then raise exception 'BJUSS_REQUEST_NOT_FOUND'; end if;
  if v_r.status not in ('pending', 'approved') then raise exception 'BJUSS_REQUEST_NOT_PENDING'; end if;

  update public.requests
     set status = 'declined', closed_at = now(),
         close_reason = case when v_r.status = 'approved' then 'giver_undid' else 'giver_declined' end
   where id = p_request_id;
  if v_r.status = 'approved' then
    update public.listings set status = 'available', updated_at = now()
     where id = v_r.listing_id and status = 'reserved';
  end if;
  if v_r.taker_id is not null then
    perform private.system_message(
      private.ensure_conversation(v_r.listing_id, v_r.taker_id),
      case when v_r.status = 'approved'
        then private.display_name(v_uid) || ' har ångrat godkännandet.'
        else private.display_name(v_uid) || ' har tackat nej den här gången.'
      end
    );
  end if;
end $$;

create function public.cancel_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.requests;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_r from public.requests where id = p_request_id for update;
  if not found or v_r.taker_id is distinct from v_uid then raise exception 'BJUSS_REQUEST_NOT_FOUND'; end if;
  if v_r.status not in ('pending', 'approved') then raise exception 'BJUSS_REQUEST_NOT_PENDING'; end if;

  update public.requests set status = 'cancelled', closed_at = now(), close_reason = 'taker_cancelled'
   where id = p_request_id;
  if v_r.status = 'approved' then
    update public.listings set status = 'available', updated_at = now()
     where id = v_r.listing_id and status = 'reserved';
  end if;
  perform private.system_message(
    private.ensure_conversation(v_r.listing_id, v_uid),
    private.display_name(v_uid) || ' har ångrat sin förfrågan.'
  );
end $$;

create function public.mark_picked_up(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.requests; v_other record;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_r from public.requests where id = p_request_id for update;
  if not found or v_uid not in (v_r.giver_id, coalesce(v_r.taker_id, v_r.giver_id)) then
    raise exception 'BJUSS_REQUEST_NOT_FOUND';
  end if;

  -- Mottagaren bekräftar i efterhand att hen hämtat (givaren hade redan markerat)
  if v_r.status = 'picked_up' then
    if v_uid = v_r.taker_id and not v_r.taker_confirmed then
      update public.requests set taker_confirmed = true where id = p_request_id;
      return;
    end if;
    raise exception 'BJUSS_ALREADY_PICKED_UP';
  end if;
  if v_r.status <> 'approved' then raise exception 'BJUSS_REQUEST_NOT_APPROVED'; end if;

  update public.requests
     set status = 'picked_up', picked_up_at = now(), closed_at = now(),
         picked_up_marked_by = case when v_uid = v_r.taker_id then 'taker' else 'giver' end,
         taker_confirmed = (v_uid = v_r.taker_id)
   where id = p_request_id;
  update public.listings set status = 'picked_up', updated_at = now() where id = v_r.listing_id;

  if v_r.taker_id is not null then
    perform private.system_message(
      private.ensure_conversation(v_r.listing_id, v_r.taker_id),
      'Hämtad! Tack för att ni bjussar.'
    );
  end if;

  -- Alla andra i kön får besked
  for v_other in
    update public.requests set status = 'declined', closed_at = now(), close_reason = 'taken_by_other'
     where listing_id = v_r.listing_id and status = 'pending'
     returning taker_id
  loop
    if v_other.taker_id is not null then
      perform private.system_message(
        private.ensure_conversation(v_r.listing_id, v_other.taker_id),
        'Någon annan hann före och har hämtat den här. Håll utkik i flödet!'
      );
    end if;
  end loop;
end $$;

-- Adress och portkod – ENDAST till godkänd mottagare (och givaren själv)
create function public.get_pickup_details(p_request_id uuid)
returns table (
  street_address text, postal_code text, city text, door_code text, instructions text,
  pickup_method text, pickup_from timestamptz, pickup_to timestamptz, pickup_deadline timestamptz
)
language sql stable security definer set search_path = '' as $$
  select h.street_address, h.postal_code, h.city, s.door_code, s.instructions,
         l.pickup_method, l.pickup_from, l.pickup_to, r.pickup_deadline
  from public.requests r
  join public.listings l on l.id = r.listing_id
  join private.homes h on h.user_id = l.giver_id
  left join private.listing_secrets s on s.listing_id = l.id
  where r.id = p_request_id
    and r.status = 'approved'
    and (r.taker_id = auth.uid() or r.giver_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Listor för "Mina"
-- ---------------------------------------------------------------------
create function public.my_listings()
returns table (
  id uuid, category text, subcategory text, size_cm smallint, shoe_size smallint, condition text,
  quantity smallint, thumb_path text, status text, pickup_method text, created_at timestamptz,
  pending_count integer, approved_request_id uuid, approved_taker_name text, approved_deadline timestamptz
)
language sql stable security definer set search_path = '' as $$
  select l.id, l.category, l.subcategory, l.size_cm, l.shoe_size, l.condition, l.quantity, l.thumb_path,
         l.status, l.pickup_method, l.created_at,
         (select count(*)::integer from public.requests r where r.listing_id = l.id and r.status = 'pending'),
         a.id, private.display_name(a.taker_id), a.pickup_deadline
  from public.listings l
  left join public.requests a on a.listing_id = l.id and a.status = 'approved'
  where l.giver_id = auth.uid() and l.status <> 'removed'
  order by (l.status in ('available', 'reserved')) desc, l.created_at desc
$$;

create function public.listing_requests(p_listing_id uuid)
returns table (
  id uuid, status text, created_at timestamptz, approved_at timestamptz, pickup_deadline timestamptz,
  picked_up_at timestamptz, taker_confirmed boolean, taker_id uuid, taker_name text, conversation_id uuid
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status, r.created_at, r.approved_at, r.pickup_deadline, r.picked_up_at, r.taker_confirmed,
         r.taker_id, private.display_name(r.taker_id),
         (select c.id from public.conversations c where c.listing_id = r.listing_id and c.taker_id = r.taker_id)
  from public.requests r
  join public.listings l on l.id = r.listing_id
  where r.listing_id = p_listing_id and l.giver_id = auth.uid()
  order by case r.status when 'approved' then 0 when 'pending' then 1 else 2 end, r.created_at
$$;

create function public.my_requests()
returns table (
  id uuid, status text, created_at timestamptz, approved_at timestamptz, pickup_deadline timestamptz,
  picked_up_at timestamptz, taker_confirmed boolean, close_reason text, queue_position integer,
  listing_id uuid, category text, subcategory text, size_cm smallint, shoe_size smallint,
  thumb_path text, listing_status text, pickup_method text, area_name text,
  giver_id uuid, giver_name text, conversation_id uuid
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status, r.created_at, r.approved_at, r.pickup_deadline, r.picked_up_at, r.taker_confirmed,
         r.close_reason,
         case when r.status = 'pending' then (
           select count(*)::integer + 1 from public.requests q
           where q.listing_id = r.listing_id and q.status = 'pending' and q.created_at < r.created_at
         ) end,
         l.id, l.category, l.subcategory, l.size_cm, l.shoe_size, l.thumb_path, l.status, l.pickup_method,
         l.area_name, l.giver_id, private.display_name(l.giver_id),
         (select c.id from public.conversations c where c.listing_id = l.id and c.taker_id = r.taker_id)
  from public.requests r
  join public.listings l on l.id = r.listing_id
  where r.taker_id = auth.uid()
  order by case r.status when 'approved' then 0 when 'pending' then 1 else 2 end, r.created_at desc
$$;

-- ---------------------------------------------------------------------
-- Chatt
-- ---------------------------------------------------------------------
create function public.start_conversation(p_listing_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_l public.listings;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_l from public.listings where id = p_listing_id;
  if not found or not private.can_see_listing(p_listing_id) then raise exception 'BJUSS_LISTING_NOT_FOUND'; end if;
  if v_l.giver_id = v_uid then raise exception 'BJUSS_OWN_LISTING'; end if;
  if private.blocked_between(v_uid, v_l.giver_id) then raise exception 'BJUSS_BLOCKED'; end if;
  return private.ensure_conversation(p_listing_id, v_uid);
end $$;

create type public.conversation_view as (
  id uuid,
  listing_id uuid,
  category text,
  subcategory text,
  size_cm smallint,
  shoe_size smallint,
  thumb_path text,
  listing_status text,
  pickup_method text,
  my_role text,
  other_user_id uuid,
  other_name text,
  last_message_at timestamptz,
  last_message_preview text,
  unread boolean,
  request_id uuid,
  request_status text,
  taker_confirmed boolean
);

create function private.conversation_view(p_c public.conversations) returns public.conversation_view
language sql stable security definer set search_path = '' as $$
  select c.id, l.id, l.category, l.subcategory, l.size_cm, l.shoe_size, l.thumb_path, l.status, l.pickup_method,
         case when c.giver_id = auth.uid() then 'giver' else 'taker' end,
         case when c.giver_id = auth.uid() then c.taker_id else c.giver_id end,
         private.display_name(case when c.giver_id = auth.uid() then c.taker_id else c.giver_id end),
         c.last_message_at, c.last_message_preview,
         c.last_message_at is not null
           and c.last_sender_id is distinct from auth.uid()
           and c.last_message_at > coalesce(
             case when c.giver_id = auth.uid() then c.giver_read_at else c.taker_read_at end, '-infinity'),
         r.id, r.status, r.taker_confirmed
  from (select p_c.*) c
  join public.listings l on l.id = c.listing_id
  left join lateral (
    select r.id, r.status, r.taker_confirmed from public.requests r
    where r.listing_id = c.listing_id and r.taker_id = c.taker_id
    order by r.created_at desc limit 1
  ) r on true
$$;

create function public.my_conversations() returns setof public.conversation_view
language sql stable security definer set search_path = '' as $$
  select (private.conversation_view(c)).*
  from public.conversations c
  where auth.uid() in (c.giver_id, c.taker_id)
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

create function public.get_conversation(p_conversation_id uuid) returns setof public.conversation_view
language sql stable security definer set search_path = '' as $$
  select (private.conversation_view(c)).*
  from public.conversations c
  where c.id = p_conversation_id and auth.uid() in (c.giver_id, c.taker_id)
$$;

create function public.mark_conversation_read(p_conversation_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversations
     set giver_read_at = case when giver_id = auth.uid() then clock_timestamp() else giver_read_at end,
         taker_read_at = case when taker_id = auth.uid() then clock_timestamp() else taker_read_at end
   where id = p_conversation_id and auth.uid() in (giver_id, taker_id)
$$;

create function public.unread_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.my_conversations() v where v.unread
$$;

-- ---------------------------------------------------------------------
-- Radera konto (GDPR). Appen tar först bort användarens bilder.
-- ---------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  -- Pågående förfrågningar på andras annonser släpps
  update public.listings l set status = 'available', updated_at = now()
   where l.status = 'reserved'
     and exists (select 1 from public.requests r where r.listing_id = l.id and r.taker_id = v_uid and r.status = 'approved');
  update public.requests set status = 'cancelled', closed_at = now(), close_reason = 'taker_cancelled'
   where taker_id = v_uid and status in ('pending', 'approved');
  delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------------------------------------------
-- Bildlagring: privat "bucket", filer sparas under <användar-id>/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "Bjuss: ladda upp bilder i egen mapp" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Bjuss: se egna bilder och bilder på annonser man får se" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or private.can_see_photo(name))
  );

create policy "Bjuss: radera egna bilder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- Realtid för chatten (nya meddelanden dyker upp direkt)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when others then
  raise notice 'Kunde inte slå på realtid för messages: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Rättigheter för funktioner: bara inloggade får anropa, aldrig anonyma.
-- (Körs sist så att den täcker alla funktioner ovan.)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname as schema
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.schema = 'public' then
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- De hjälpfunktioner som säkerhetsreglerna (RLS) anropar
grant execute on function
  private.settings(),
  private.blocked_between(uuid, uuid),
  private.is_near(uuid),
  private.can_see_listing(uuid),
  private.is_participant(uuid),
  private.conversation_blocked(uuid),
  private.can_see_photo(text)
to authenticated;
