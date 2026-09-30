-- =====================================================================
-- Bjuss – tar bort bildtolkningen med Claude (kostade pengar per bild).
-- Spärren mot bilbarnstolar (ord i texten) och varningarna finns kvar,
-- de är gratis och körs i appen och databasen.
-- =====================================================================

drop function if exists public.consume_ai_quota();
drop table if exists private.ai_usage;
alter table public.app_settings drop column if exists ai_daily_limit;

-- create_listing utan AI-flaggorna
drop function public.create_listing(text, text, text, text, text, text, integer, integer, integer, text, text, timestamptz, timestamptz, text, text, boolean, boolean);
alter table public.listings
  drop column if exists ai_suggested,
  drop column if exists child_warning_overridden;

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
  -- Bilbarnstolar spärras även i instruktionen (övriga fält kontrolleras av en trigger)
  if private.mentions_car_seat(p_instructions) then raise exception 'BJUSS_CAR_SEAT'; end if;

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

select private.secure_functions();
