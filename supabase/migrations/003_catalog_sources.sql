-- Hike-in-one catalog: where a product's details came from.
-- Run once in the Supabase SQL Editor after 002_catalog.sql (safe to re-run).
-- If the editor offers "Run and enable RLS", choose "Run without RLS".
--
--   origin      'user' - typed in by someone in the app
--               'link' - filled from a product page via "Look it up"
--               'seed' - imported by the project's starter seed files
--   source_url  the page the specs were taken from, shown on the product
--               page so anyone can check them.

alter table public.catalog_products add column if not exists source_url text;
alter table public.catalog_products add column if not exists origin text not null default 'user';

alter table public.catalog_products drop constraint if exists catalog_products_origin;
alter table public.catalog_products add constraint catalog_products_origin
  check (origin in ('user', 'link', 'seed'));
alter table public.catalog_products drop constraint if exists catalog_products_source_url;
alter table public.catalog_products add constraint catalog_products_source_url
  check (source_url is null or (source_url ~* '^https?://' and char_length(source_url) <= 500));

-- Same guard as 002, plus: app users can only mark their own additions
-- 'user' or 'link' ('seed' is reserved for imports run in the SQL
-- Editor, where there is no signed-in user), and origin never changes
-- after creation.
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
    if auth.uid() is not null and new.origin not in ('user', 'link') then
      new.origin := 'user';
    end if;
    return new;
  end if;
  new.id := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.origin := old.origin;
  new.updated_by := auth.uid();
  new.updated_at := now();
  new.name := btrim(new.name);
  new.brand := btrim(new.brand);
  new.model := nullif(btrim(new.model), '');
  insert into public.catalog_product_revisions (product_id, changed_by, previous)
  values (old.id, auth.uid(), to_jsonb(old) - 'normalized_key' - 'search_text');
  return new;
end $$;
