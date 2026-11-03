-- Behaviour tests for supabase/migrations/004_shared_routes.sql.
\set QUIET on
create or replace function pg_temp.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL (no error): %', label;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  % -> %', label, left(sqlerrm, 90);
end $$;
create or replace function pg_temp.check(cond boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'ok  %', label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
create temp table t_token(token text);
grant all on t_token to anon, authenticated;

-- Owner A shares a trip's route.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
insert into shared_routes(trip_id, name, route) values ('trip_1', '  Haute Route ', '[{"name":"Day 1","points":[[46,7],[46.1,7.1]]}]');
insert into t_token select token from shared_routes where trip_id = 'trip_1';
select pg_temp.check((select char_length(token) = 32 and name = 'Haute Route' and owner_id = auth.uid() from shared_routes), 'owner shares a route: random 32-char token, owner set, name trimmed');
update shared_routes set token = 'mine', owner_id = 'bbbbbbbb-0000-0000-0000-000000000002', name = 'Haute Route v2' where trip_id = 'trip_1';
select pg_temp.check((select token = (select token from t_token) and owner_id = auth.uid() and name = 'Haute Route v2' from shared_routes), 'token and owner never change; the route can be updated');
select pg_temp.expect_error($$insert into shared_routes(trip_id, name) values ('trip_1', 'Again')$$, 'one shared copy per trip');
select pg_temp.expect_error($$insert into shared_routes(trip_id, name, route) values ('trip_2', 'x', '{"not":"a list"}')$$, 'route must be a list');
select pg_temp.expect_error($$insert into shared_routes(trip_id, name, owner_id) values ('trip_3', 'x', 'bbbbbbbb-0000-0000-0000-000000000002')$$, 'cannot share as someone else');
reset role;

-- A partner with the link (no account).
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.expect_error($$select * from shared_routes$$, 'anonymous visitors cannot list shared routes');
select pg_temp.check((select get_shared_route((select token from t_token)) ->> 'name') = 'Haute Route v2', 'the link opens the route');
select pg_temp.check(get_shared_route('00000000000000000000000000000000') is null, 'a wrong token finds nothing');
select pg_temp.check(get_shared_route('') is null, 'an empty token finds nothing');
select add_route_suggestion((select token from t_token), ' Sam ', 'Take the lower path after the hut?', 46.05, 7.05);
select add_route_suggestion((select token from t_token), 'Kim', 'Start an hour earlier');
select pg_temp.check((select jsonb_array_length(get_shared_route((select token from t_token)) -> 'suggestions')) = 2, 'partners see every suggestion');
select pg_temp.check((select get_shared_route((select token from t_token)) -> 'suggestions' -> 0 ->> 'author') = 'Sam', 'author trimmed, oldest first');
select pg_temp.expect_error($$select add_route_suggestion('00000000000000000000000000000000', 'Sam', 'hi')$$, 'cannot suggest on a missing route');
select pg_temp.expect_error($$select add_route_suggestion((select token from t_token), 'Sam', '   ')$$, 'empty suggestion rejected');
select pg_temp.expect_error($$select add_route_suggestion((select token from t_token), 'Sam', 'x', 46, null)$$, 'a point needs both lat and lon');
select pg_temp.expect_error($$insert into route_suggestions(route_id, author, body) select id, 'x', 'y' from shared_routes$$, 'no direct writes to suggestions');
reset role;

-- Someone else, signed in, cannot see or change A's route or suggestions.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
set role authenticated;
select pg_temp.check((select count(*) = 0 from shared_routes), 'other users do not see the route');
select pg_temp.check((select count(*) = 0 from route_suggestions), 'other users do not see the suggestions');
update route_suggestions set done = true;
delete from shared_routes;
reset role;
select pg_temp.check((select count(*) = 1 from shared_routes) and (select count(*) = 0 from route_suggestions where done), 'other users cannot change or delete it');

-- The owner reads, ticks off and stops sharing.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
select pg_temp.check((select count(*) = 2 from route_suggestions), 'owner sees the suggestions');
update route_suggestions set done = true where author = 'Kim';
select pg_temp.check((select count(*) = 1 from route_suggestions where done), 'owner ticks a suggestion off');
select pg_temp.expect_error($$update route_suggestions set body = 'changed'$$, 'owner cannot rewrite what partners said');
delete from shared_routes where trip_id = 'trip_1';
reset role;
select pg_temp.check((select count(*) = 0 from route_suggestions), 'stopping sharing removes its suggestions');
select pg_temp.check(get_shared_route((select token from t_token)) is null, 'the old link stops working');
select set_config('request.jwt.claim.sub', '', false);
\echo ALL SHARED ROUTE TESTS PASSED
