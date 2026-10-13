-- Behaviour tests for supabase/migrations/002_catalog.sql (run via tests/run-sql-tests.sh).
-- Each check raises "FAIL: ..." and stops the run if the database misbehaves.
\set QUIET on
grant usage on schema extensions to anon, authenticated;
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

-- anon
set role anon;
select pg_temp.check((select count(*) from catalog_products) = 0, 'anon can read the (empty) catalog');
select pg_temp.expect_error($$insert into catalog_products(name, brand) values ('Exos 58','Osprey')$$, 'anon cannot add products');
reset role;

-- user A creates
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
insert into catalog_products(name, brand, model, category, weight_g, created_by, specs)
  values ('  Exos 58 ', 'Osprey', '', 'Backpack', 1240, 'bbbbbbbb-0000-0000-0000-000000000002', '{"volume_l":58}');
select pg_temp.check((select created_by = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'Exos 58' and model is null from catalog_products), 'created_by forced to caller, fields trimmed, empty model -> null');
select pg_temp.expect_error($$insert into catalog_products(name, brand) values ('Osprey EXOS-58','osprey ')$$, 'exact duplicate (brand repeated in name, case/punctuation) rejected');
select pg_temp.check((select count(*) = 1 and bool_and(exact) from find_similar_products('OSPREY', 'Osprey Exos 58')), 'find_similar: exact match flagged');
select pg_temp.check((select count(*) >= 1 and not bool_or(exact) from find_similar_products('Osprey', 'Exos58')), 'find_similar: near-match found, not exact');
select pg_temp.check((select count(*) = 0 from find_similar_products('Big Agnes', 'Copper Spur UL2')), 'find_similar: unrelated product not flagged');
insert into catalog_products(name, brand, model, category, weight_g) values ('Exos 58', 'Osprey', '2023', 'Backpack', 1200);
select pg_temp.check(true, 'same name with a different model is allowed');
insert into catalog_products(name, brand, category, weight_g) values ('Copper Spur HV UL2', 'Big Agnes', 'Shelter', 1420);
select pg_temp.check((select array_agg(brand||' '||name order by brand) = array['Osprey Exos 58','Osprey Exos 58'] from search_catalog('exos osp')), 'search: words in any order');
select pg_temp.check((select count(*) >= 1 from search_catalog('ospery exos')), 'search: typo tolerated');
select pg_temp.check((select name from search_catalog('copper') limit 1) = 'Copper Spur HV UL2', 'search: single word');
select pg_temp.check((select count(*) = 0 from search_catalog('x')), 'search: 1-char query returns nothing');

-- validation
select pg_temp.expect_error($$insert into catalog_products(name, brand, weight_g) values ('Thing A','Brand', 0)$$, 'weight 0 rejected');
select pg_temp.expect_error($$insert into catalog_products(name, brand, weight_g) values ('Thing B','Brand', 60000)$$, 'weight 60 kg rejected');
select pg_temp.expect_error($$insert into catalog_products(name, brand, category) values ('Thing C','Brand','Kayak')$$, 'unknown category rejected');
select pg_temp.expect_error($$insert into catalog_products(name, brand) values ('x','Brand')$$, 'too-short name rejected');
select pg_temp.expect_error($$insert into catalog_products(name, brand) values ('Thing D','  ')$$, 'blank brand rejected');
select pg_temp.expect_error($$insert into catalog_products(name, brand, specs) values ('Thing E','Brand','[1,2]')$$, 'non-object specs rejected');
select pg_temp.expect_error($$insert into catalog_products(name, brand, product_url) values ('Thing F','Brand','javascript:alert(1)')$$, 'non-http url rejected');
reset role;

-- user B edits (wiki-style) -> revision logged
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false);
set role authenticated;
update catalog_products set weight_g = 1230, created_by = 'bbbbbbbb-0000-0000-0000-000000000002', created_at = '2000-01-01'
  where brand = 'Osprey' and model is null;
select pg_temp.check((select weight_g = 1230 and created_by = 'aaaaaaaa-0000-0000-0000-000000000001' and updated_by = 'bbbbbbbb-0000-0000-0000-000000000002' and created_at > '2020-01-01'
  from catalog_products where brand = 'Osprey' and model is null), 'B can edit; creator/created_at immutable; updated_by = B');
select pg_temp.check((select count(*) = 1 and min((previous->>'weight_g')::int) = 1240 and min(changed_by::text) = 'bbbbbbbb-0000-0000-0000-000000000002' from catalog_product_revisions), 'revision stores the previous version');
select pg_temp.expect_error($$insert into catalog_product_revisions(product_id, previous) select id, '{}' from catalog_products limit 1$$, 'users cannot write revisions directly');
select pg_temp.expect_error($$delete from catalog_products$$, 'nobody can delete products');

-- reviews + profiles
select pg_temp.expect_error($$insert into reviews(product_id, rating) select id, 5 from catalog_products limit 1$$, 'review needs a display-name profile first');
insert into profiles(display_name) values ('Bea');
select pg_temp.expect_error($$insert into profiles(user_id, display_name) values ('aaaaaaaa-0000-0000-0000-000000000001','Imposter')$$, 'cannot create a profile for someone else');
select pg_temp.expect_error($$insert into reviews(product_id, rating) select id, 6 from catalog_products limit 1$$, 'rating 6 rejected');
insert into reviews(product_id, rating, text) select id, 4, 'Comfy, but the hipbelt pockets are small.' from catalog_products where brand='Osprey' and model is null;
select pg_temp.expect_error($$insert into reviews(product_id, rating) select id, 3 from catalog_products where brand='Osprey' and model is null$$, 'one review per user per product');
select pg_temp.check((select review_count = 1 and avg_rating = 4.0 from search_catalog('exos') where model is null), 'search returns review count + average');
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
set role authenticated;
update reviews set rating = 1;
select pg_temp.check((select rating = 4 from reviews), 'A cannot edit B''s review');
delete from reviews;
select pg_temp.check((select count(*) = 1 from reviews), 'A cannot delete B''s review');

-- photos
select pg_temp.expect_error($$insert into catalog_photos(product_id, storage_path) select id, 'bbbbbbbb-0000-0000-0000-000000000002/p.jpg' from catalog_products limit 1$$, 'photo row in someone else''s folder rejected');
select pg_temp.expect_error($$insert into catalog_photos(product_id, storage_path) select id, 'aaaaaaaa-0000-0000-0000-000000000001/../x.jpg' from catalog_products limit 1$$, 'path traversal rejected');
insert into catalog_photos(product_id, storage_path) select id, 'aaaaaaaa-0000-0000-0000-000000000001/p'||g||'.jpg' from catalog_products, generate_series(1,12) g where brand='Osprey' and model is null;
select pg_temp.expect_error($$insert into catalog_photos(product_id, storage_path) select id, 'aaaaaaaa-0000-0000-0000-000000000001/p13.jpg' from catalog_products where brand='Osprey' and model is null$$, '13th photo rejected');
select pg_temp.check((select photo_path = 'aaaaaaaa-0000-0000-0000-000000000001/p1.jpg' from search_catalog('exos') where model is null), 'search returns first photo');
insert into storage.objects(bucket_id, name) values ('catalog-photos', 'aaaaaaaa-0000-0000-0000-000000000001/p1.jpg');
select pg_temp.check(true, 'storage: upload into own folder allowed');
select pg_temp.expect_error($$insert into storage.objects(bucket_id, name) values ('catalog-photos', 'bbbbbbbb-0000-0000-0000-000000000002/x.jpg')$$, 'storage: upload into another user''s folder rejected');
reset role;
select pg_temp.check((select public and file_size_limit = 2097152 from storage.buckets where id = 'catalog-photos'), 'bucket created public with 2 MB limit');
\echo ALL CATALOG SQL TESTS PASSED
