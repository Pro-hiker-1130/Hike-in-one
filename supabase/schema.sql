-- Hike-in-one cloud sync — run once in your Supabase project's SQL Editor.
--
-- One row per signed-in user, holding their whole local dataset as JSON —
-- this mirrors how the app already persists locally (each of gear/trips/
-- loadouts/tracks is a single JSON blob), so sync is "upsert the blob" per
-- user rather than a per-record table per entity.
--
-- Row-level security means the anon key embedded in index.html is safe to
-- publish: a signed-in user can only ever read or write the row where
-- user_id = their own auth.uid(), nothing else.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gear jsonb not null default '[]',
  trips jsonb not null default '[]',
  loadouts jsonb not null default '[]',
  tracks jsonb not null default '[]',
  google_points jsonb not null default '[]',
  basemap text,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can read their own data"
  on public.user_data for select
  using (auth.uid() = user_id);

create policy "Users can insert their own data"
  on public.user_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own data"
  on public.user_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
