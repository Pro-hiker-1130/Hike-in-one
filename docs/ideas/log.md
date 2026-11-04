# Daily log

Newest first. Each run: date, research or polish, what was looked at,
what changed, anything for the owner.

## 2026-11-04 — polish

Looked at: the message bubble at the bottom (toast), which yesterday's
features now use a lot (CSV import with Undo, route sharing, link copied).
It popped in and vanished at once.
Changed: the toast now slides up and fades in (220 ms) and fades out
(180 ms) before hiding. A new message while one is showing or fading
replays the slide and cancels the fade. With reduced motion it only fades
in. New e2e test.
Also fixed a flaky test from yesterday's route sharing: the partner page
drew the route only after a 60 ms delayed fit, so the route line appeared
a moment late and the test sometimes looked too early. The map now sets
its view at once and refits after layout; the test waits for the line.
Tests: 41 unit, 47 e2e, all passing. Service worker cache bumped to
`waypoints-v14`.
For the owner: nothing to decide. The `004_shared_routes.sql` migration
still needs running in Supabase if you haven't yet.

## 2026-11-03 — owner request: build every backlog idea

The owner asked to build all 12 backlog ideas, including the ones that need
new saved fields, Open-Meteo forecasts and a database change. This was well
beyond the usual one-idea budget, done on the owner's instruction, with one
commit per idea. All tests pass: 41 unit, 46 e2e, and the SQL tests
including the new migration.

Polish:
- Pages fade in when switching tabs (map page: fade only).
- Map stat tiles count up for 300 ms when they change on screen.
- Empty states show a small line drawing (peaks, trail, sun) in sage.
- Elevation profiles sweep in from the left the first time they show.

Features:
- Packing mode on a trip: big tap rows and a progress bar. New saved field
  `trip.packedIds`.
- Base / worn / consumable split. New saved field `gear.packRole`, set as
  "Carried as" in the gear form; Food is consumable unless set otherwise.
  The CSV download gains a column for it.
- Terrain summary under each track: steepest climb and descent, top, km
  above a round height.
- Split a planned route into days. New saved field `trip.dailyKm`.
- Import gear from a CSV (this app's own download and common gear-list
  layouts), with Undo.
- Forecast at a planned trip's start from Open-Meteo, within 16 days. Sends
  only the start point rounded to ~1 km and the dates.
- Share a trip as a 1080×1350 image, drawn on the device.
- Share a route with partners by link. They need no account and can leave
  suggestions, optionally pinned to a spot. This adds
  `supabase/migrations/004_shared_routes.sql`.

For the owner:
- Run `004_shared_routes.sql` once in the Supabase SQL Editor before using
  "Share with partners". Until then, sharing shows an error and nothing else
  is affected.
- Open-Meteo replied "daily request limit exceeded" to this cloud machine,
  so the live forecast call was only tested against a mocked answer. Worth a
  quick look on a real trip within 16 days.
- New saved fields (`packedIds`, `packRole`, `dailyKm`) ride along in the
  existing synced JSON, so no schema change is needed for them.

## 2026-11-03 — research (extra run, asked for by the owner)

Looked at: LighterPack (gear lists with weight totals, spreadsheet
import/export, shareable links) and Gaia GPS (multi-day planner with daily
distance goals, weather overlay). Budget used: 2 searches, 0 fetches.
Changed: the Gear Room has a "Download CSV" button. It saves the whole gear
list (wishlist included) as a spreadsheet with these columns: name, category,
brand, model, weight, quantity, status, price, currency, purchase date,
condition and tags. Rows follow the Gear Room's category order. Cells are
quoted properly, and a cell starting with = + - @ gets a leading ' so a
spreadsheet won't run it as a formula. A byte-order mark lets Excel show
accents correctly. New e2e test checks the download. Service worker
cache bumped to `waypoints-v12`.
For the owner: I chose this over the "check off while packing" idea
because that one needs a new saved field on trips, which the bot rules
leave to you. Say if you want that field and I can build it.
Next run should be a polish day.

## 2026-11-03 — research

Looked at: PeakVisor (sunrise/sunset times for a spot, aimed at planning
photo and early starts) and CalTopo (terrain stats, sharing route maps
with partners, viewshed). Budget used: 2 searches, 0 fetches.
Changed: a planned trip's page now shows sunrise, sunset and hours of
daylight at the route's start on the trip's date, for example "Sunrise 05:55 ·
sunset 21:14 · 15 h 19 min of daylight on Sat 18 Jul 2026 at the start".
It is worked out on the device with the standard sunrise equation in
`track-core.js` (`sunTimes`), so no new service is used. It also handles
midnight sun and polar night. Unit tests check it against published
London and Sydney times. The e2e trips test checks the line appears once the
planned trip has a route. Service worker cache bumped to `waypoints-v11`.
For the owner: times use this device's time zone (the line says so). For
a trip in another time zone they will be off by the difference.
Showing the trip location's own local time would need time-zone data
(a library or a lookup service); say if you want that.

## 2026-11-03 — polish

Looked at: how dialogs open (every `.modal-overlay` is shown by switching
`display` from none to flex, so a CSS animation restarts on each open).
Changed: dialogs now open with a short animation. The backdrop fades in
(180 ms) and the panel rises 8 px and scales from 97 % (220 ms). This is CSS
only, in `css/app.css`, so it covers every dialog with no JS changes. With
reduced motion, the panel only fades (120 ms). Closing is still instant, so
input is never blocked. Checked at 390×844 and 1280×900. Unit and e2e tests
pass. Service worker cache bumped to `waypoints-v10`.
For the owner: nothing to decide. A matching close animation would need a
small JS helper, because closing sets display:none at once. That can be
added later if wanted.

## 2026-11-03 — setup

Branch and instructions created. First run is a polish day.
