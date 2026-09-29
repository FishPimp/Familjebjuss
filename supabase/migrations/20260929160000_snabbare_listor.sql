-- =====================================================================
-- Bjuss – prestanda: flöde, annonser, chattlistor och statistik
-- "(funktion(x)).*" anropar funktionen en gång per kolumn (27 gånger per
-- annons i flödet). Med LATERAL anropas den bara en gång per rad.
-- =====================================================================

create or replace function public.get_listing(p_listing_id uuid) returns setof public.listing_view
language sql stable security definer set search_path = '' as $$
  select v.*
  from public.listings l
  cross join lateral private.listing_view(l) v
  where l.id = p_listing_id and private.can_see_listing(l.id)
$$;

create or replace function public.feed(
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
  select v.*
  from (
    select l.*
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
      and (p_sizes_cm is null or l.size_cm = any (p_sizes_cm) or (not p_size_strict and l.size_cm is null))
      and (p_shoe_sizes is null or l.shoe_size = any (p_shoe_sizes) or (not p_size_strict and l.shoe_size is null))
    order by l.created_at desc
    limit least(greatest(p_limit, 1), 100)
  ) l
  cross join lateral private.listing_view(l::public.listings) v
  order by v.created_at desc
$$;

create or replace function public.my_conversations() returns setof public.conversation_view
language sql stable security definer set search_path = '' as $$
  select v.*
  from public.conversations c
  cross join lateral private.conversation_view(c) v
  where auth.uid() in (c.giver_id, c.taker_id)
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

create or replace function public.get_conversation(p_conversation_id uuid) returns setof public.conversation_view
language sql stable security definer set search_path = '' as $$
  select v.*
  from public.conversations c
  cross join lateral private.conversation_view(c) v
  where c.id = p_conversation_id and auth.uid() in (c.giver_id, c.taker_id)
$$;

create or replace function public.user_stats(p_user_id uuid) returns setof public.user_stats
language sql stable security definer set search_path = '' as $$
  select s.* from public.profiles p cross join lateral private.user_stats(p.id) s where p.id = p_user_id
$$;

-- Snabbare uppslag av chattar och förfrågningar per annons och person
create index if not exists requests_listing_taker_idx on public.requests (listing_id, taker_id, created_at desc);

select private.secure_functions();
