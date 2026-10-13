-- Hike-in-one shared gear catalog — run once in the Supabase SQL Editor,
-- after schema.sql. Safe to re-run: every statement is idempotent.
-- If the editor offers "Run and enable RLS", choose "Run without RLS":
-- this script already enables RLS on every table, and the editor's
-- helper can paste its lines into the middle of a function and break it.
--
-- The catalog holds product *definitions* shared by everyone ("Osprey
-- Exos 58"), not the items people own. Owned items stay in each user's
-- private user_data.gear blob and point here with a catalogProductId, so
-- nothing about the existing gear room changes and no data migration is
-- needed: an item without that field is simply "not linked yet".
--
-- Access model:
--   * Anyone (even signed out) can read products, photos, reviews and
--     display names — it's a public catalog.
--   * Signed-in users can add products and edit any product, wiki-style.
--     Every edit is recorded in catalog_product_revisions (old version,
--     who, when) by a trigger, so bad edits can be traced and reverted.
--     Nobody can delete products from the app (gear items link to them).
--   * Photos and reviews belong to whoever added them; only they can
--     change or remove them.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Normalisation, shared by the duplicate check and search. Lower-case,
-- every run of non-letters/digits becomes one space (so "Exos-58",
-- "exos 58" and "EXOS  58!" all match). Mirrored in catalog-core.js.
create or replace function public.catalog_normalize(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Identity of a product: brand + name + model. A name that repeats the
-- brand ("Osprey Exos 58" by Osprey) counts the same as "Exos 58".
create or replace function public.catalog_key(p_brand text, p_name text, p_model text)
returns text language sql immutable parallel safe as $$
  with n as (
    select public.catalog_normalize(p_brand) as b,
           public.catalog_normalize(p_name)  as nm,
           public.catalog_normalize(p_model) as m
  )
  select b || '|' ||
         case when b <> '' and nm like b || ' %' then substr(nm, char_length(b) + 2) else nm end ||
         '|' || m
  from n
$$;

-- ---------------------------------------------------------------------
create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  model text,
  category text not null default 'Other',
  weight_g integer,
  description text,
  specs jsonb not null default '{}'::jsonb,
  product_url text,
  normalized_key text generated always as (public.catalog_key(brand, name, model)) stored,
  search_text text generated always as (public.catalog_normalize(brand || ' ' || name || ' ' || coalesce(model, ''))) stored,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),

  constraint catalog_products_name_len check (char_length(btrim(name)) between 2 and 120),
  constraint catalog_products_brand_len check (char_length(btrim(brand)) between 1 and 80),
  constraint catalog_products_model_len check (model is null or char_length(model) <= 80),
  constraint catalog_products_category check (category in (
    'Backpack','Shelter','Sleep system','Clothing','Footwear','Cooking','Water',
    'Navigation','Electronics','Safety','Hygiene','Food','Other')),
  -- 50 kg is far beyond any single piece of hiking gear; catches unit
  -- mix-ups (kg typed as g) without rejecting a heavy expedition tent.
  constraint catalog_products_weight check (weight_g is null or weight_g between 1 and 50000),
  constraint catalog_products_description_len check (description is null or char_length(description) <= 2000),
  constraint catalog_products_specs check (jsonb_typeof(specs) = 'object' and pg_column_size(specs) <= 8192),
  constraint catalog_products_url check (product_url is null or (product_url ~* '^https?://' and char_length(product_url) <= 500))
);
alter table public.catalog_products enable row level security;

create unique index if not exists catalog_products_key_uq on public.catalog_products (normalized_key);
create index if not exists catalog_products_search_trgm on public.catalog_products using gin (search_text extensions.gin_trgm_ops);

create table if not exists public.catalog_product_revisions (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  previous jsonb not null
);
alter table public.catalog_product_revisions enable row level security;
create index if not exists catalog_product_revisions_product on public.catalog_product_revisions (product_id, changed_at desc);

-- Who created/edited a product is set here, never trusted from the
-- client; immutable columns can't be rewritten; each update archives
-- the previous version.
create or replace function public.catalog_products_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.name := btrim(new.name);
    new.brand := btrim(new.brand);
    new.model := nullif(btrim(new.model), '');
    return new;
  end if;
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_by := auth.uid();
  new.updated_at := now();
  new.name := btrim(new.name);
  new.brand := btrim(new.brand);
  new.model := nullif(btrim(new.model), '');
  insert into public.catalog_product_revisions (product_id, changed_by, previous)
  values (old.id, auth.uid(), to_jsonb(old) - 'normalized_key' - 'search_text');
  return new;
end $$;

drop trigger if exists catalog_products_guard on public.catalog_products;
create trigger catalog_products_guard before insert or update on public.catalog_products
  for each row execute function public.catalog_products_guard();

-- ---------------------------------------------------------------------
-- Display names shown on reviews (never the email address). A review
-- references its author's profile, so one must exist first.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 2 and 40)
);
alter table public.profiles enable row level security;

-- Photos live in the public "catalog-photos" storage bucket under
-- <uploader's user id>/<file>; this table ties them to a product.
create table if not exists public.catalog_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  storage_path text not null unique,
  uploaded_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint catalog_photos_path check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$')
);
alter table public.catalog_photos enable row level security;
create index if not exists catalog_photos_product on public.catalog_photos (product_id, created_at);

-- Keeps one product from collecting an unbounded pile of photos.
create or replace function public.catalog_photos_limit()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.catalog_photos where product_id = new.product_id) >= 12 then
    raise exception 'This product already has the maximum of 12 photos' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists catalog_photos_limit on public.catalog_photos;
create trigger catalog_photos_limit before insert on public.catalog_photos
  for each row execute function public.catalog_photos_limit();

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(user_id) on delete cascade,
  rating smallint not null,
  text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_rating check (rating between 1 and 5),
  constraint reviews_text_len check (text is null or char_length(text) <= 4000),
  constraint reviews_one_per_user unique (product_id, user_id)
);
alter table public.reviews enable row level security;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end $$;
drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Row-level security policies (RLS itself is switched on right after
-- each create table above).

drop policy if exists "Catalog is public" on public.catalog_products;
create policy "Catalog is public" on public.catalog_products for select using (true);
drop policy if exists "Signed-in users add products" on public.catalog_products;
create policy "Signed-in users add products" on public.catalog_products for insert to authenticated with check (true);
drop policy if exists "Signed-in users edit products" on public.catalog_products;
create policy "Signed-in users edit products" on public.catalog_products for update to authenticated using (true) with check (true);

drop policy if exists "Revisions are public" on public.catalog_product_revisions;
create policy "Revisions are public" on public.catalog_product_revisions for select using (true);

drop policy if exists "Photos are public" on public.catalog_photos;
create policy "Photos are public" on public.catalog_photos for select using (true);
drop policy if exists "Users add photos to their own folder" on public.catalog_photos;
create policy "Users add photos to their own folder" on public.catalog_photos for insert to authenticated
  with check (uploaded_by = auth.uid() and split_part(storage_path, '/', 1) = auth.uid()::text);
drop policy if exists "Users remove their own photos" on public.catalog_photos;
create policy "Users remove their own photos" on public.catalog_photos for delete to authenticated
  using (uploaded_by = auth.uid());

drop policy if exists "Reviews are public" on public.reviews;
create policy "Reviews are public" on public.reviews for select using (true);
drop policy if exists "Users write their own reviews" on public.reviews;
create policy "Users write their own reviews" on public.reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users edit their own reviews" on public.reviews;
create policy "Users edit their own reviews" on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users delete their own reviews" on public.reviews;
create policy "Users delete their own reviews" on public.reviews for delete to authenticated using (user_id = auth.uid());

drop policy if exists "Display names are public" on public.profiles;
create policy "Display names are public" on public.profiles for select using (true);
drop policy if exists "Users create their own profile" on public.profiles;
create policy "Users create their own profile" on public.profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users edit their own profile" on public.profiles;
create policy "Users edit their own profile" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.catalog_products, public.catalog_product_revisions, public.catalog_photos,
  public.reviews, public.profiles to anon, authenticated;
grant insert, update on public.catalog_products to authenticated;
grant insert, delete on public.catalog_photos to authenticated;
grant insert, update, delete on public.reviews to authenticated;
grant insert, update on public.profiles to authenticated;
revoke insert, update, delete on public.catalog_product_revisions from anon, authenticated;

-- ---------------------------------------------------------------------
-- Search for the add-gear autocomplete: every typed word must appear
-- (in any order), with a fuzzy fallback for typos ("ospery exos").
create or replace function public.search_catalog(q text, max_results integer default 12)
returns table (
  id uuid, name text, brand text, model text, category text, weight_g integer,
  photo_path text, review_count bigint, avg_rating numeric, score real
)
language sql stable set search_path = public, extensions as $$
  with nq as (select public.catalog_normalize(q) as v)
  select p.id, p.name, p.brand, p.model, p.category, p.weight_g,
    (select ph.storage_path from public.catalog_photos ph where ph.product_id = p.id order by ph.created_at limit 1),
    (select count(*) from public.reviews r where r.product_id = p.id),
    (select round(avg(r.rating), 1) from public.reviews r where r.product_id = p.id),
    greatest(similarity(p.search_text, nq.v), word_similarity(nq.v, p.search_text))
  from public.catalog_products p, nq
  where char_length(nq.v) >= 2
    and (
      not exists (
        select 1 from unnest(string_to_array(nq.v, ' ')) w
        where p.search_text not like '%' || w || '%'
      )
      or word_similarity(nq.v, p.search_text) >= 0.5
    )
  order by (p.search_text like nq.v || '%') desc,
           greatest(similarity(p.search_text, nq.v), word_similarity(nq.v, p.search_text)) desc,
           p.brand, p.name
  limit least(greatest(coalesce(max_results, 12), 1), 50)
$$;

-- Duplicate check before creating a product: the exact identity match
-- (which the unique index would reject anyway) plus close look-alikes,
-- so the app can ask "Did you mean…?".
create or replace function public.find_similar_products(p_brand text, p_name text, p_model text default null)
returns table (
  id uuid, name text, brand text, model text, category text, weight_g integer, exact boolean, score real
)
language sql stable set search_path = public, extensions as $$
  with c as (
    select public.catalog_key(p_brand, p_name, p_model) as k,
           public.catalog_normalize(coalesce(p_brand, '') || ' ' || coalesce(p_name, '') || ' ' || coalesce(p_model, '')) as t
  )
  select p.id, p.name, p.brand, p.model, p.category, p.weight_g,
         p.normalized_key = c.k,
         similarity(p.search_text, c.t)
  from public.catalog_products p, c
  where p.normalized_key = c.k
     or similarity(p.search_text, c.t) >= 0.45
     or (public.catalog_normalize(p.brand) = public.catalog_normalize(p_brand)
         and word_similarity(public.catalog_normalize(p_name), p.search_text) >= 0.7)
  order by (p.normalized_key = c.k) desc, similarity(p.search_text, c.t) desc
  limit 5
$$;

grant execute on function public.search_catalog(text, integer) to anon, authenticated;
grant execute on function public.find_similar_products(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Storage bucket for catalog photos: public read, uploads only into the
-- uploader's own folder, images only, 2 MB max (the app shrinks photos
-- to well under that before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-photos', 'catalog-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Catalog photos: upload to own folder" on storage.objects;
create policy "Catalog photos: upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Catalog photos: delete own" on storage.objects;
create policy "Catalog photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-photos' and (storage.foldername(name))[1] = auth.uid()::text);
