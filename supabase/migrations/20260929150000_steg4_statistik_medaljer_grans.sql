-- =====================================================================
-- Bjuss – steg 4
--   Öppen profilstatistik, medaljpoäng (skyddade mot fusk),
--   hämtningsgräns per kalendermånad och statistik per område.
-- =====================================================================

alter table public.app_settings
  add column monthly_pickup_limit integer not null default 5 check (monthly_pickup_limit between 1 and 1000),
  add column free_pickups integer not null default 10 check (free_pickups between 0 and 1000),
  add column pickup_notice_at integer not null default 4 check (pickup_notice_at between 0 and 1000),
  -- Högst så här många bjussningar till SAMMA mottagare per månad räknas mot medaljer
  add column medal_cap_per_taker_month integer not null default 2 check (medal_cap_per_taker_month between 1 and 100);

-- ---------------------------------------------------------------------
-- Medaljpoäng: bara bekräftade bjussningar, högst N per mottagare och månad.
-- Två konton som bjussar till varandra kan alltså inte samla medaljer snabbt.
-- ---------------------------------------------------------------------
create function private.medal_points(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(least(n, (private.settings()).medal_cap_per_taker_month)), 0)::integer
  from (
    select count(*) as n
    from public.requests
    where giver_id = p_user and status = 'picked_up' and taker_confirmed
    group by coalesce(taker_id::text, 'raderad'),
             date_trunc('month', picked_up_at at time zone 'Europe/Stockholm')
  ) per_taker_month
$$;

-- Öppen profil: namn, område och antal – aldrig vem man gett till eller fått av
create function public.public_profile(p_user_id uuid)
returns table (
  id uuid, display_name text, area_name text, member_since timestamptz,
  given_count integer, received_count integer, no_show_count integer, reliability_pct integer,
  rating_good integer, rating_total integer, medal_points integer, unique_takers integer
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.area_name, date_trunc('month', p.created_at),
         s.given_count, s.received_count, s.no_show_count, s.reliability_pct, s.rating_good, s.rating_total,
         private.medal_points(p.id),
         (select count(distinct taker_id)::integer from public.requests
           where giver_id = p.id and status = 'picked_up' and taker_confirmed)
  from public.profiles p
  cross join lateral private.user_stats(p.id) s
  where p.id = p_user_id
$$;

-- ---------------------------------------------------------------------
-- Hämtningsgräns: max N per kalendermånad. De första hämtningarna
-- (free_pickups) räknas inte. Godkända men ännu ej hämtade räknas som
-- kommande hämtningar så att man inte kan "boka" förbi gränsen.
-- ---------------------------------------------------------------------
create function private.pickup_usage(p_user uuid)
returns table (used integer, monthly_limit integer, free_left integer, notice_at integer, reached boolean)
language sql stable security definer set search_path = '' as $$
  with s as (select * from private.settings()),
  picked as (
    select picked_up_at, row_number() over (order by picked_up_at, id) as rn
    from public.requests where taker_id = p_user and status = 'picked_up'
  ),
  agg as (
    select
      (select count(*) from picked) as lifetime,
      (select count(*) from picked, s
        where picked.rn > s.free_pickups
          and picked.picked_up_at >= (date_trunc('month', now() at time zone 'Europe/Stockholm') at time zone 'Europe/Stockholm')
      ) as counted_this_month,
      (select count(*) from public.requests where taker_id = p_user and status = 'approved') as active
  )
  select
    (agg.counted_this_month + greatest(0, agg.active - greatest(0, s.free_pickups - agg.lifetime)))::integer,
    s.monthly_pickup_limit,
    greatest(0, s.free_pickups - agg.lifetime - agg.active)::integer,
    s.pickup_notice_at,
    (agg.counted_this_month + greatest(0, agg.active - greatest(0, s.free_pickups - agg.lifetime))) >= s.monthly_pickup_limit
  from agg, s
$$;

create function public.my_pickup_status()
returns table (used integer, monthly_limit integer, free_left integer, notice_at integer, reached boolean)
language sql stable security definer set search_path = '' as $$
  select * from private.pickup_usage(auth.uid())
$$;

create or replace function private.assert_can_request(p_taker uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select count(*) from public.requests where taker_id = p_taker and status = 'pending')
     >= (private.settings()).max_open_requests then
    raise exception 'BJUSS_TOO_MANY_OPEN_REQUESTS';
  end if;
  if (select reached from private.pickup_usage(p_taker)) then
    raise exception 'BJUSS_PICKUP_LIMIT';
  end if;
end $$;

create or replace function private.assert_can_be_approved(p_taker uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select reached from private.pickup_usage(p_taker)) then
    raise exception 'BJUSS_TAKER_AT_LIMIT';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Statistik per område (för framtida rapporter till kommuner och
-- bostadsbolag). Läses i Supabase: select * from private.area_stats;
-- Vikten är en grov uppskattning per kategori.
-- ---------------------------------------------------------------------
create function private.estimated_kg(p_category text, p_subcategory text, p_quantity integer) returns numeric
language sql immutable set search_path = '' as $$
  select round((case
    when p_subcategory in ('Barnvagn') then 10
    when p_subcategory in ('Säng', 'Skötbord') then 15
    when p_subcategory in ('Matstol') then 6
    when p_subcategory in ('Bärsele', 'Babysitter') then 2
    when p_subcategory in ('Overaller och ytterkläder', 'Regn- och skidkläder') then 0.6
    when p_subcategory in ('Kängor och vinterskor', 'Gummistövlar') then 0.8
    when p_category = 'clothes' then 0.2
    when p_category = 'shoes' then 0.5
    when p_category = 'toys' then 0.5
    when p_category = 'books_games' then 0.4
    when p_category = 'bikes_sports' then 6
    else 1
  end * greatest(coalesce(p_quantity, 1), 1))::numeric, 1)
$$;

create view private.area_stats as
select
  coalesce(l.area_city, '–') as city,
  coalesce(l.area_name, '–') as area,
  date_trunc('month', r.picked_up_at at time zone 'Europe/Stockholm')::date as month,
  count(*) as pickups,
  count(*) filter (where r.taker_confirmed) as confirmed_pickups,
  sum(l.quantity) as items,
  sum(private.estimated_kg(l.category, l.subcategory, l.quantity)) as estimated_kg,
  count(distinct l.giver_id) as givers,
  count(distinct r.taker_id) as takers
from public.requests r
join public.listings l on l.id = r.listing_id
where r.status = 'picked_up'
group by 1, 2, 3;

select private.secure_functions();
