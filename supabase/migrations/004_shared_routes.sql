-- Hike-in-one: share a trip's route with partners, who can suggest changes.
-- Run once in the Supabase SQL Editor after 003 (safe to re-run).
-- If the editor offers "Run and enable RLS", choose "Run without RLS"
-- (this file enables it itself).
--
-- The owner (signed in) keeps one shared copy per trip: the route's shape
-- and elevation profile, nothing else from their data. The copy has a long
-- random token; whoever has the link can read that one route and its
-- suggestions and add a suggestion, without an account. They do that only
-- through the two functions at the end, so the token is the only way in:
-- the tables themselves are closed to anyone but the owner.

create table if not exists public.shared_routes (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_id text not null,
  name text not null,
  route jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, trip_id)
);

alter table public.shared_routes drop constraint if exists shared_routes_name;
alter table public.shared_routes add constraint shared_routes_name
  check (char_length(btrim(name)) between 1 and 120);
alter table public.shared_routes drop constraint if exists shared_routes_route;
alter table public.shared_routes add constraint shared_routes_route
  check (jsonb_typeof(route) = 'array' and pg_column_size(route) <= 500000);

create table if not exists public.route_suggestions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.shared_routes(id) on delete cascade,
  author text not null,
  body text not null,
  lat double precision,
  lon double precision,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists route_suggestions_route on public.route_suggestions(route_id, created_at);

alter table public.route_suggestions drop constraint if exists route_suggestions_text;
alter table public.route_suggestions add constraint route_suggestions_text
  check (char_length(btrim(author)) between 1 and 60 and char_length(btrim(body)) between 1 and 1000);
alter table public.route_suggestions drop constraint if exists route_suggestions_point;
alter table public.route_suggestions add constraint route_suggestions_point
  check ((lat is null) = (lon is null) and (lat is null or (lat between -90 and 90 and lon between -180 and 180)));

alter table public.shared_routes enable row level security;
alter table public.route_suggestions enable row level security;

drop policy if exists "Owners manage their shared routes" on public.shared_routes;
create policy "Owners manage their shared routes"
  on public.shared_routes for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners read suggestions on their routes" on public.route_suggestions;
create policy "Owners read suggestions on their routes"
  on public.route_suggestions for select
  using (exists (select 1 from public.shared_routes r where r.id = route_id and r.owner_id = auth.uid()));
drop policy if exists "Owners tick off suggestions on their routes" on public.route_suggestions;
create policy "Owners tick off suggestions on their routes"
  on public.route_suggestions for update
  using (exists (select 1 from public.shared_routes r where r.id = route_id and r.owner_id = auth.uid()));
drop policy if exists "Owners delete suggestions on their routes" on public.route_suggestions;
create policy "Owners delete suggestions on their routes"
  on public.route_suggestions for delete
  using (exists (select 1 from public.shared_routes r where r.id = route_id and r.owner_id = auth.uid()));

revoke all on public.shared_routes, public.route_suggestions from anon;
grant select, insert, update, delete on public.shared_routes to authenticated;
grant select, delete on public.route_suggestions to authenticated;
grant update (done) on public.route_suggestions to authenticated;

-- The token and owner never change after creation; updated_at is the server's.
create or replace function public.shared_routes_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.token := old.token;
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.name := btrim(new.name);
  return new;
end $$;
drop trigger if exists shared_routes_guard on public.shared_routes;
create trigger shared_routes_guard before insert or update on public.shared_routes
  for each row execute function public.shared_routes_guard();

-- For partners with the link: the route and every suggestion on it.
create or replace function public.get_shared_route(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', r.name, 'route', r.route, 'updated_at', r.updated_at,
    'suggestions', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'author', s.author, 'body', s.body,
        'lat', s.lat, 'lon', s.lon, 'done', s.done, 'created_at', s.created_at) order by s.created_at)
      from public.route_suggestions s where s.route_id = r.id), '[]'::jsonb))
  from public.shared_routes r
  where r.token = p_token and char_length(p_token) >= 24;
$$;

-- For partners with the link: add a suggestion (optionally at a point).
-- At most 300 per route, so a leaked link can't flood the owner.
create or replace function public.add_route_suggestion(p_token text, p_author text, p_body text,
  p_lat double precision default null, p_lon double precision default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  sid uuid;
begin
  select id into rid from public.shared_routes where token = p_token and char_length(p_token) >= 24;
  if rid is null then raise exception 'This shared route no longer exists' using errcode = 'P0002'; end if;
  if (select count(*) from public.route_suggestions where route_id = rid) >= 300 then
    raise exception 'This route already has the maximum of 300 suggestions' using errcode = 'P0001';
  end if;
  insert into public.route_suggestions(route_id, author, body, lat, lon)
    values (rid, btrim(p_author), btrim(p_body), p_lat, p_lon)
    returning id into sid;
  return sid;
end $$;

revoke execute on function public.get_shared_route(text) from public;
revoke execute on function public.add_route_suggestion(text, text, text, double precision, double precision) from public;
grant execute on function public.get_shared_route(text) to anon, authenticated;
grant execute on function public.add_route_suggestion(text, text, text, double precision, double precision) to anon, authenticated;
