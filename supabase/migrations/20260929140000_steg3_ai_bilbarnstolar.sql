-- =====================================================================
-- Bjuss – steg 3
--   Bildtolkning med Claude (kvot per dag), spärr mot bilbarnstolar,
--   flaggor för AI-förifyllning och "inget barn på bilden"-överskridning.
-- =====================================================================

alter table public.app_settings
  add column ai_daily_limit integer not null default 30 check (ai_daily_limit between 0 and 1000);

-- ---------------------------------------------------------------------
-- Kvot för bildtolkning (skyddar mot höga kostnader)
-- ---------------------------------------------------------------------
create table private.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);
alter table private.ai_usage enable row level security;

-- Anropas av Edge Function "analyze-photo" med användarens inloggning.
-- Returnerar hur många tolkningar som finns kvar i dag.
create function public.consume_ai_quota() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_day date := (now() at time zone 'Europe/Stockholm')::date;
  v_count integer;
  v_limit integer := (private.settings()).ai_daily_limit;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  insert into private.ai_usage (user_id, day, count) values (v_uid, v_day, 1)
  on conflict (user_id, day) do update set count = private.ai_usage.count + 1
  returning count into v_count;
  if v_count > v_limit then raise exception 'BJUSS_AI_LIMIT'; end if;
  return v_limit - v_count;
end $$;

-- ---------------------------------------------------------------------
-- Bilbarnstolar är helt blockerade – kontrolleras i databasen så att
-- det inte går att kringgå appen.
-- ---------------------------------------------------------------------
create function private.mentions_car_seat(p_text text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    lower(p_text) ~ '(bil[ -]?barns?[ -]?stol|bilstol|bältes[ -]?stol|bältes[ -]?kudde|babyskydd|isofix|car[ -]?seat|autostol|bilsete)',
    false)
$$;

create function private.block_car_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.mentions_car_seat(new.subcategory)
     or private.mentions_car_seat(new.brand)
     or private.mentions_car_seat(new.description) then
    raise exception 'BJUSS_CAR_SEAT';
  end if;
  return new;
end $$;

create trigger listings_block_car_seats before insert or update of subcategory, brand, description
  on public.listings for each row execute function private.block_car_seats();

-- ---------------------------------------------------------------------
-- Flaggor på annonsen
-- ---------------------------------------------------------------------
alter table public.listings
  add column ai_suggested boolean not null default false,
  -- Användaren sa "det är inget barn på bilden" trots varning – för granskning
  add column child_warning_overridden boolean not null default false;

-- create_listing får två nya (frivilliga) parametrar
drop function public.create_listing(text, text, text, text, text, text, integer, integer, integer, text, text, timestamptz, timestamptz, text, text);
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
  p_instructions text default null,
  p_ai_suggested boolean default false,
  p_child_warning_overridden boolean default false
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
  -- Instruktion och portkod kontrolleras också
  if private.mentions_car_seat(p_instructions) then raise exception 'BJUSS_CAR_SEAT'; end if;

  insert into public.listings (
    giver_id, category, subcategory, size_cm, shoe_size, condition, quantity, brand, description,
    photo_path, thumb_path, pickup_method, pickup_from, pickup_to, area_name, area_city,
    ai_suggested, child_warning_overridden
  ) values (
    v_uid, p_category, nullif(btrim(p_subcategory), ''), p_size_cm, p_shoe_size, p_condition,
    coalesce(p_quantity, 1), nullif(btrim(p_brand), ''), nullif(btrim(p_description), ''),
    p_photo_path, p_thumb_path, p_pickup_method,
    case when p_pickup_method = 'home' then p_pickup_from end,
    case when p_pickup_method = 'home' then p_pickup_to end,
    v_profile.area_name, v_profile.area_city,
    coalesce(p_ai_suggested, false), coalesce(p_child_warning_overridden, false)
  ) returning id into v_id;

  if p_pickup_method = 'door'
     and (nullif(btrim(p_door_code), '') is not null or nullif(btrim(p_instructions), '') is not null) then
    insert into private.listing_secrets (listing_id, door_code, instructions)
    values (v_id, nullif(btrim(p_door_code), ''), nullif(btrim(p_instructions), ''));
  end if;
  return v_id;
end $$;

select private.secure_functions();
