-- =====================================================================
-- Bjuss – steg 2
--   filter och sök, barnens storlekar, kö och 24-timmarsregel,
--   pålitlighetsbetyg, omdöme efter hämtning, rapportera och blockera.
-- =====================================================================

alter table public.app_settings
  add column reports_to_hide integer not null default 3 check (reports_to_hide between 1 and 100),
  add column max_address_changes_30d integer not null default 3 check (max_address_changes_30d between 1 and 100);

-- ---------------------------------------------------------------------
-- Barn (privat för föräldern): ålder och storlekar
-- ---------------------------------------------------------------------
create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  nickname text check (char_length(nickname) <= 30),
  birth_month date not null check (extract(day from birth_month) = 1 and birth_month > date '2000-01-01'),
  clothes_size_cm smallint check (clothes_size_cm between 40 and 190),
  shoe_size smallint check (shoe_size between 15 and 45),
  created_at timestamptz not null default clock_timestamp()
);
create index children_parent_idx on public.children (parent_id);
alter table public.children enable row level security;
revoke all on public.children from anon, authenticated;
create policy "Föräldern ser sina barn" on public.children
  for select to authenticated using (parent_id = (select auth.uid()));
create policy "Föräldern lägger till barn" on public.children
  for insert to authenticated with check (parent_id = (select auth.uid()));
create policy "Föräldern ändrar sina barn" on public.children
  for update to authenticated using (parent_id = (select auth.uid())) with check (parent_id = (select auth.uid()));
create policy "Föräldern tar bort sina barn" on public.children
  for delete to authenticated using (parent_id = (select auth.uid()));
grant select, delete on public.children to authenticated;
grant insert (nickname, birth_month, clothes_size_cm, shoe_size) on public.children to authenticated;
grant update (nickname, birth_month, clothes_size_cm, shoe_size) on public.children to authenticated;
grant all on public.children to service_role;

-- ---------------------------------------------------------------------
-- Omdöme efter hämtning
-- ---------------------------------------------------------------------
alter table public.requests
  add column rating text check (rating in ('as_described', 'not_quite')),
  add column rated_at timestamptz;

create function public.rate_pickup(p_request_id uuid, p_rating text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.requests;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_r from public.requests where id = p_request_id for update;
  if not found or v_r.taker_id is distinct from v_uid then raise exception 'BJUSS_REQUEST_NOT_FOUND'; end if;
  if v_r.status <> 'picked_up' then raise exception 'BJUSS_NOT_PICKED_UP'; end if;
  if v_r.rating is not null then raise exception 'BJUSS_ALREADY_RATED'; end if;
  if p_rating not in ('as_described', 'not_quite') then raise exception 'BJUSS_BAD_RATING'; end if;
  -- Att lämna omdöme räknas också som bekräftad hämtning
  update public.requests set rating = p_rating, rated_at = now(), taker_confirmed = true where id = p_request_id;
end $$;

-- ---------------------------------------------------------------------
-- Blockera
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);
alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
create policy "Se vilka jag blockerat" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
grant select on public.blocks to authenticated;
grant all on public.blocks to service_role;

create or replace function private.blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

create function public.block_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r record;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  if p_user_id = v_uid then raise exception 'BJUSS_CANNOT_BLOCK_SELF'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_uid, p_user_id) on conflict do nothing;

  -- Pågående förfrågningar mellan oss avslutas
  for v_r in
    update public.requests
       set status = case when taker_id = v_uid then 'cancelled' else 'declined' end,
           closed_at = now(),
           close_reason = case when taker_id = v_uid then 'taker_cancelled' else 'giver_declined' end
     where status in ('pending', 'approved')
       and ((giver_id = v_uid and taker_id = p_user_id) or (giver_id = p_user_id and taker_id = v_uid))
     returning listing_id, status
  loop
    update public.listings set status = 'available', updated_at = now()
     where id = v_r.listing_id and status = 'reserved'
       and not exists (select 1 from public.requests q where q.listing_id = v_r.listing_id and q.status = 'approved');
  end loop;
end $$;

create function public.unblock_user(p_user_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user_id
$$;

create function public.my_blocks()
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, private.display_name(b.blocked_id), b.created_at
  from public.blocks b where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

-- ---------------------------------------------------------------------
-- Rapportera annonser och användare
-- ---------------------------------------------------------------------
alter table public.listings add column hidden boolean not null default false;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  reason text not null check (reason in ('child_in_photo', 'car_seat', 'unsafe', 'not_free', 'inappropriate', 'harassment', 'spam', 'other')),
  details text check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_note text
);
create index reports_listing_idx on public.reports (listing_id);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
create policy "Se egna rapporter" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
grant select on public.reports to authenticated;
grant all on public.reports to service_role;

create function public.report(
  p_reason text,
  p_listing_id uuid default null,
  p_user_id uuid default null,
  p_details text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_target uuid := p_user_id;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  if p_reason is null then raise exception 'BJUSS_REPORT_REASON'; end if;
  if p_listing_id is not null then
    if not private.can_see_listing(p_listing_id) then raise exception 'BJUSS_LISTING_NOT_FOUND'; end if;
    select giver_id into v_target from public.listings where id = p_listing_id;
  end if;
  if v_target is null then raise exception 'BJUSS_REPORT_REASON'; end if;

  insert into public.reports (reporter_id, listing_id, reported_user_id, reason, details)
  values (v_uid, p_listing_id, v_target, p_reason, nullif(btrim(p_details), ''));

  -- Döljs automatiskt när tillräckligt många olika grannar rapporterat annonsen
  if p_listing_id is not null and (
    select count(distinct reporter_id) from public.reports where listing_id = p_listing_id and handled_at is null
  ) >= (private.settings()).reports_to_hide then
    update public.listings set hidden = true, updated_at = now() where id = p_listing_id;
  end if;
end $$;

-- Dolda annonser syns inte för grannar (men fortfarande för de inblandade)
create or replace function private.can_see_listing(p_listing_id uuid) returns boolean
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
          and not l.hidden
          and private.is_near(l.giver_id)
          and not private.blocked_between(auth.uid(), l.giver_id)
        )
      )
  )
$$;

-- ---------------------------------------------------------------------
-- Statistik och pålitlighet (bara antal – aldrig vem)
-- ---------------------------------------------------------------------
create type public.user_stats as (
  user_id uuid,
  given_count integer,
  received_count integer,
  no_show_count integer,
  reliability_pct integer,
  rating_good integer,
  rating_total integer
);

create function private.user_stats(p_user uuid) returns public.user_stats
language sql stable security definer set search_path = '' as $$
  with t as (
    select
      count(*) filter (where taker_id = p_user and status = 'picked_up') as received,
      count(*) filter (where taker_id = p_user and status = 'expired') as no_show,
      count(*) filter (where giver_id = p_user and status = 'picked_up' and taker_confirmed) as given,
      count(*) filter (where giver_id = p_user and rating = 'as_described') as good,
      count(*) filter (where giver_id = p_user and rating is not null) as rated
    from public.requests
    where taker_id = p_user or giver_id = p_user
  )
  select p_user, given::integer, received::integer, no_show::integer,
         case when received + no_show = 0 then null
              else round(100.0 * received / (received + no_show))::integer end,
         good::integer, rated::integer
  from t
$$;

create function public.user_stats(p_user_id uuid) returns setof public.user_stats
language sql stable security definer set search_path = '' as $$
  select (private.user_stats(p.id)).* from public.profiles p where p.id = p_user_id
$$;

-- Förfrågningar till givaren: nu med mottagarens statistik
drop function public.listing_requests(uuid);
create function public.listing_requests(p_listing_id uuid)
returns table (
  id uuid, status text, created_at timestamptz, approved_at timestamptz, pickup_deadline timestamptz,
  picked_up_at timestamptz, taker_confirmed boolean, taker_id uuid, taker_name text, conversation_id uuid,
  taker_given integer, taker_received integer, taker_no_shows integer, taker_reliability_pct integer
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status, r.created_at, r.approved_at, r.pickup_deadline, r.picked_up_at, r.taker_confirmed,
         r.taker_id, private.display_name(r.taker_id),
         (select c.id from public.conversations c where c.listing_id = r.listing_id and c.taker_id = r.taker_id),
         s.given_count, s.received_count, s.no_show_count, s.reliability_pct
  from public.requests r
  join public.listings l on l.id = r.listing_id
  left join lateral (select * from private.user_stats(r.taker_id)) s on r.taker_id is not null
  where r.listing_id = p_listing_id and l.giver_id = auth.uid()
  order by case r.status when 'approved' then 0 when 'pending' then 1 else 2 end, r.created_at
$$;

-- Mina hämtningar: nu med omdöme
drop function public.my_requests();
create function public.my_requests()
returns table (
  id uuid, status text, created_at timestamptz, approved_at timestamptz, pickup_deadline timestamptz,
  picked_up_at timestamptz, taker_confirmed boolean, close_reason text, queue_position integer,
  listing_id uuid, category text, subcategory text, size_cm smallint, shoe_size smallint,
  thumb_path text, listing_status text, pickup_method text, area_name text,
  giver_id uuid, giver_name text, conversation_id uuid, rating text
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
         (select c.id from public.conversations c where c.listing_id = l.id and c.taker_id = r.taker_id),
         r.rating
  from public.requests r
  join public.listings l on l.id = r.listing_id
  where r.taker_id = auth.uid()
  order by case r.status when 'approved' then 0 when 'pending' then 1 else 2 end, r.created_at desc
$$;

-- ---------------------------------------------------------------------
-- Kö och 24-timmarsregel
-- ---------------------------------------------------------------------

-- Säger till den som står först i kön att saken blivit ledig igen
create function private.notify_queue_released(p_listing_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_next public.requests;
begin
  select * into v_next from public.requests
   where listing_id = p_listing_id and status = 'pending' and taker_id is not null
   order by created_at limit 1;
  if found then
    perform private.system_message(
      private.ensure_conversation(p_listing_id, v_next.taker_id),
      'Den här blev ledig igen och du står först i kön. Bjussaren kan nu godkänna dig.'
    );
  end if;
end $$;

-- Förfrågningar som inte hämtats i tid: saken blir ledig och mottagaren får en prick.
create function public.expire_overdue_requests() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_r record; v_count integer := 0;
begin
  for v_r in
    update public.requests
       set status = 'expired', closed_at = now(), close_reason = 'expired'
     where status = 'approved' and pickup_deadline < now()
     returning id, listing_id, taker_id
  loop
    v_count := v_count + 1;
    update public.listings set status = 'available', updated_at = now()
     where id = v_r.listing_id and status = 'reserved';
    if v_r.taker_id is not null then
      perform private.system_message(
        private.ensure_conversation(v_r.listing_id, v_r.taker_id),
        'Tiden för hämtning gick ut. Saken är ledig igen och går vidare till nästa i kön.'
      );
    end if;
    perform private.notify_queue_released(v_r.listing_id);
  end loop;
  return v_count;
end $$;

-- Ångra (mottagare) och ångra godkännande (givare) släpper också till nästa i kön
create or replace function public.decline_request(p_request_id uuid) returns void
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
  if v_r.taker_id is not null then
    perform private.system_message(
      private.ensure_conversation(v_r.listing_id, v_r.taker_id),
      case when v_r.status = 'approved'
        then private.display_name(v_uid) || ' har ångrat godkännandet.'
        else private.display_name(v_uid) || ' har tackat nej den här gången.'
      end
    );
  end if;
  if v_r.status = 'approved' then
    update public.listings set status = 'available', updated_at = now()
     where id = v_r.listing_id and status = 'reserved';
    perform private.notify_queue_released(v_r.listing_id);
  end if;
end $$;

create or replace function public.cancel_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.requests;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  select * into v_r from public.requests where id = p_request_id for update;
  if not found or v_r.taker_id is distinct from v_uid then raise exception 'BJUSS_REQUEST_NOT_FOUND'; end if;
  if v_r.status not in ('pending', 'approved') then raise exception 'BJUSS_REQUEST_NOT_PENDING'; end if;

  update public.requests set status = 'cancelled', closed_at = now(), close_reason = 'taker_cancelled'
   where id = p_request_id;
  perform private.system_message(
    private.ensure_conversation(v_r.listing_id, v_uid),
    private.display_name(v_uid) || ' har ångrat sin förfrågan.'
  );
  if v_r.status = 'approved' then
    update public.listings set status = 'available', updated_at = now()
     where id = v_r.listing_id and status = 'reserved';
    perform private.notify_queue_released(v_r.listing_id);
  end if;
end $$;

-- Körs automatiskt var femte minut (om pg_cron finns). Appen anropar den också.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('bjuss-expire-requests', '*/5 * * * *', 'select public.expire_overdue_requests()');
exception when others then
  raise notice 'pg_cron kunde inte slås på (%). Utgångna hämtningar hanteras ändå när appen används.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Flödet med filter och sök
-- ---------------------------------------------------------------------
drop function public.feed(integer, timestamptz);
create function public.feed(
  p_limit integer default 60,
  p_before timestamptz default null,
  p_category text default null,
  p_subcategory text default null,
  p_sizes_cm integer[] default null,
  p_shoe_sizes integer[] default null,
  p_size_strict boolean default true,
  p_conditions text[] default null,
  p_brand text default null,
  p_search text default null
)
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
    and not l.hidden
    and not private.blocked_between(auth.uid(), l.giver_id)
    and (p_before is null or l.created_at < p_before)
    and (p_category is null or l.category = p_category)
    and (p_subcategory is null or l.subcategory = p_subcategory)
    and (p_conditions is null or l.condition = any (p_conditions))
    and (p_brand is null or l.brand ilike '%' || p_brand || '%')
    and (
      p_search is null
      or l.subcategory ilike '%' || p_search || '%'
      or l.brand ilike '%' || p_search || '%'
      or l.description ilike '%' || p_search || '%'
    )
    and (
      p_sizes_cm is null
      or l.size_cm = any (p_sizes_cm)
      or (not p_size_strict and l.size_cm is null)
    )
    and (
      p_shoe_sizes is null
      or l.shoe_size = any (p_shoe_sizes)
      or (not p_size_strict and l.shoe_size is null)
    )
  order by l.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------
-- Skydd mot att "flytta runt" sin adress för att se andra områden
-- ---------------------------------------------------------------------
create table private.home_changes (
  user_id uuid not null references auth.users (id) on delete cascade,
  changed_at timestamptz not null default now()
);
create index home_changes_user_idx on private.home_changes (user_id, changed_at);
alter table private.home_changes enable row level security;

create or replace function public.set_home(
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
  v_point extensions.geography;
  v_old private.homes;
begin
  if v_uid is null then raise exception 'BJUSS_NOT_LOGGED_IN'; end if;
  if not exists (select 1 from public.profiles where id = v_uid) then raise exception 'BJUSS_NO_PROFILE'; end if;
  if length(v_postal) <> 5 then raise exception 'BJUSS_BAD_POSTAL_CODE'; end if;
  if p_lat is null or p_lng is null or p_lat not between 55.0 and 69.2 or p_lng not between 10.5 and 24.5 then
    raise exception 'BJUSS_OUTSIDE_SWEDEN';
  end if;
  if nullif(btrim(p_area_name), '') is null then raise exception 'BJUSS_AREA_REQUIRED'; end if;
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;

  select * into v_old from private.homes where user_id = v_uid;
  if found and extensions.st_distance(v_old.location, v_point) > 100 then
    if (select count(*) from private.home_changes
         where user_id = v_uid and changed_at > now() - interval '30 days')
       >= (private.settings()).max_address_changes_30d then
      raise exception 'BJUSS_ADDRESS_CHANGE_LIMIT';
    end if;
    insert into private.home_changes (user_id) values (v_uid);
  end if;

  insert into private.homes (user_id, street_address, postal_code, city, location, approx_location, updated_at)
  values (
    v_uid, btrim(p_street_address), substr(v_postal, 1, 3) || ' ' || substr(v_postal, 4, 2), btrim(p_city),
    v_point, private.snap_to_grid(p_lat, p_lng), now()
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

-- ---------------------------------------------------------------------
-- Rättigheter för funktioner. Samma regel som i steg 1, nu som en
-- återanvändbar funktion som varje ny migrering avslutar med att köra.
-- ---------------------------------------------------------------------
create function private.secure_functions() returns void
language plpgsql set search_path = '' as $$
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

  -- Hjälpfunktioner som säkerhetsreglerna (RLS) anropar
  grant execute on function
    private.settings(),
    private.blocked_between(uuid, uuid),
    private.is_near(uuid),
    private.can_see_listing(uuid),
    private.is_participant(uuid),
    private.conversation_blocked(uuid),
    private.can_see_photo(text)
  to authenticated;
end $$;

select private.secure_functions();
