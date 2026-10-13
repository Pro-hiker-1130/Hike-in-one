-- Behaviour tests for supabase/migrations/003_catalog_sources.sql.
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

-- Seed import (SQL Editor: no signed-in user)
insert into catalog_products(name, brand, category, weight_g, origin, source_url)
  values ('Lone Peak 8', 'Altra', 'Footwear', 289, 'seed', 'https://www.altrarunning.com/');
select pg_temp.check((select origin = 'seed' and created_by is null from catalog_products where brand = 'Altra'), 'seed import keeps origin seed');
insert into catalog_products(name, brand, category, weight_g, origin) values ('Lone Peak 8', 'Altra', 'Footwear', 300, 'seed')
  on conflict (normalized_key) do nothing;
select pg_temp.check((select count(*) = 1 and min(weight_g) = 289 from catalog_products where brand = 'Altra'), 're-running a seed skips existing products');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
insert into catalog_products(name, brand, origin, source_url) values ('Tensor Trail', 'Nemo', 'link', 'https://www.nemoequipment.com/tensor');
select pg_temp.check((select origin = 'link' from catalog_products where brand = 'Nemo'), 'user can add a product filled from a link');
insert into catalog_products(name, brand, origin) values ('Spark SpI', 'Sea to Summit', 'seed');
select pg_temp.check((select origin = 'user' from catalog_products where brand = 'Sea to Summit'), 'users cannot label their additions as seed');
update catalog_products set origin = 'user', weight_g = 290 where brand = 'Altra';
select pg_temp.check((select origin = 'seed' and weight_g = 290 from catalog_products where brand = 'Altra'), 'origin is fixed after creation, edits still allowed');
select pg_temp.expect_error($$insert into catalog_products(name, brand, source_url) values ('Thing G','Brand','ftp://x')$$, 'non-http source url rejected');
insert into catalog_products(name, brand, origin) values ('Thing H', 'Brand', 'robot');
select pg_temp.check((select origin = 'user' from catalog_products where name = 'Thing H'), 'app users get origin user for anything unexpected');
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($$insert into catalog_products(name, brand, origin) values ('Thing I','Brand','robot')$$, 'unknown origin rejected for imports');
\echo ALL SOURCE TESTS PASSED
