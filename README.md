# Hike-in-one

Your hikes, gear and trips in one place: a map of everything you've walked,
a Gear Room with weights, trips with elevation profiles and packing lists,
and a shared gear catalog. It runs in the browser and installs as an app
(PWA). Data lives on the device; signing in syncs it through Supabase.

## How it's built

Plain static files with no build step. GitHub Pages serves the repository
as is.

| Path | What's in it |
| --- | --- |
| `index.html` | The page markup: nav, the four pages and all dialogs. |
| `css/app.css` | All styles. Colors are tokens on `:root` (Topo Light theme). |
| `js/*.js` | The app, as plain scripts that `index.html` loads in order and that share one global scope (see below). |
| `catalog-core.js` | Catalog logic with no DOM (validation, linking gear to products). Unit-tested. |
| `service-worker.js` | Offline support: caches the app files and the pinned CDN libraries. |
| `supabase/` | Database schema and migrations, Edge Functions, and the catalog seed files. |
| `tests/` | Unit, end-to-end (Playwright) and SQL tests. |

The scripts in `js/`, in load order:

| File | Holds |
| --- | --- |
| `setup.js` | Configuration (Supabase, Strava) and the Leaflet map. |
| `activity-files.js` | Reading GPX, TCX, FIT, gzip and zip exports; country detection. |
| `storage-sync.js` | Local storage, cloud sync and backups. |
| `strava.js` | Importing single activities from a connected Strava account. |
| `map.js` | Tracks, heatmap, colors, overview stats, getting started. |
| `trips.js` | Trip data helpers and the gear checklist. |
| `loadouts.js` | Loadouts and trip-card helpers. |
| `trips-ui.js` | The Trips page, trip detail, photos and the trip form. |
| `import.js` | The "Import activities" flow. |
| `gear.js` | The Gear Room and the gear form. |
| `catalog.js` | The shared gear catalog: search, product pages, reviews, browser, lookups. |
| `app.js` | Dialogs and the Back button, navigation, event wiring and start-up. |

Code that runs at load time may only use things from the same file or an
earlier one. Functions can be called across files freely once the page has
loaded.

## Running it locally

    python3 -m http.server 8123
    # open http://localhost:8123/

## Tests

    npm test           # unit tests (catalog-core, product lookup)
    npm run test:e2e   # end-to-end, needs Playwright (+ HIKE_LIBS_DIR to serve the CDN libraries offline)
    npm run test:sql   # migrations and seeds against a local PostgreSQL

## The gear catalog

The catalog is a shared table in Supabase. Products come from the starter
seeds (`supabase/seed/*.sql`), from people using the app, and from the daily
catalog bot. The bot is a scheduled Claude Code session that writes
`supabase/seed/auto/*.sql`; see `supabase/seed/auto/README.md`. A GitHub
Action (`.github/workflows/catalog-seed.yml`) loads the seed files into
Supabase whenever they change.
