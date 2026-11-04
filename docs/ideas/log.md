# Daily log

Newest first. Each run: date, research or polish, what was looked at,
what changed, anything for the owner.

## 2026-11-04 — polish (2 of 3)

Looked at: closing dialogs. They opened with a fade-and-scale but
vanished at once on closing. Every close function hides its dialog
directly, so the change lives in one place, `onModalClosed`.
Changed: when a dialog closes, the real one is hidden at once as before,
and a copy (no ids or names, inert, no pointer events) fades and shrinks
away for 180 ms, then is removed. Clicks right after closing reach the
page, never the copy. Off under reduced motion. New e2e test.
Also fixed the flaky track-editor test. Switching to the Map tab refreshes
the map layers 50 ms later, which closed a popup the test had opened
within those 50 ms. People can't click that fast, so the test now waits
for the refresh first. 3 full runs in a row passed (53/53). Service worker
cache `waypoints-v27`.
For the owner: nothing to decide.

## 2026-11-04 — polish (owner asked for some polish days: 1 of 3)

Looked at: packing mode. Ticking an item swapped the circle for a tick
with no feedback, and the whole list re-renders on each tap, so a plain
CSS animation would replay on every packed row.
Changed: only the row just ticked plays a short pop on its circle (240 ms)
and a brief sage glow on the row (300 ms). Un-ticking stays quiet. Both are
off under reduced motion. The packing e2e test checks that only the tapped
row animates. Service worker cache `waypoints-v26`.
For the owner: nothing to decide.

## 2026-11-04 — owner request: difficulty on hikes, not trips

The owner asked for the difficulty label only on individual hikes, not on
the whole trip. Changed: the badge moved from trip cards and the trip
header to each track row on the trip page (walked hikes and planned
routes alike, from each one's own distance and climb). The Completed
trips filter now shows trips that contain at least one hike of the chosen
difficulty, with a message like "No trips with a hard hike yet." when none
match. The e2e test was rewritten for this (a trip with an easy and a
strenuous hike shows under both filters). Service worker cache
`waypoints-v25`. All tests pass: 46 unit, 52 e2e.

## 2026-11-04 — research (7 of 7)

Looked at: hike-log apps (HIKE.SH: personal records for longest
distance, biggest climb and longest duration plus streaks; SummitLynx:
badges via a digital hiking passport; APPEAK: summit stamps). Budget used:
1 search, 0 fetches.
Changed: under the year in review on the map, a "Personal bests" list
covers all time: longest walk, biggest climb, longest day out and highest
point, each with the walk it came from (name shown, name and date on
hover). Planned routes don't count. `TrackCore.personalBests` has a unit
test, plus an assertion in the map e2e test. Service worker cache
`waypoints-v24`.
For the owner: nothing to decide. Badges and streaks are possible
follow-ups if you'd like them; they're not in the backlog yet.

## 2026-11-04 — research (6 of 7)

Looked at: Gaia GPS (waypoints with icons, notes and photos for water and
camps; distance to the next water; markers dropped every 1, 10 or 50 miles
to break a route into chunks) and CalTopo (markers listed and searchable
beside the map). Budget used: 1 search, 0 fetches.
Changed: the route planner shows small kilometre markers along the route.
The step is picked to give about 5–12 markers (1, 2, 5, 10, 20 or 50 km),
and none sits right at the end. `TrackCore.kmMarkers` has a unit test; the
route-planner e2e test checks the markers on the map. Service worker cache
`waypoints-v23`.
For the owner: nothing to decide. Water/camp spots along a route stay in
the backlog as a medium idea.

## 2026-11-04 — research (5 of 7)

Looked at: Hiking Project (community difficulty ratings, line colours by
difficulty) and AllTrails / other trail apps (filter trails by Easy,
Moderate, Hard, Strenuous). Budget used: 1 search, 0 fetches.
Changed: trips get a difficulty badge (Easy, Moderate, Hard or
Strenuous) on their cards and on the trip page. It uses effort km, our own
choice of rule: distance plus 1 km per 100 m of climb, with cut-offs at 10,
20 and 30. Once there are 3 or more completed trips, the Completed trips
heading gets filter chips (All / Easy / Moderate / Hard / Strenuous), with
a message like "No hard trips yet." when a level is empty.
`TrackCore.difficulty` has a unit test, plus an e2e test.
For the owner: the cut-offs are a judgement call. Say if trips feel rated
too hard or too easy and I'll shift them.

## 2026-11-04 — research (owner asked for 4 more research days: 4 of 7)

Synced first: main had new commits from other sessions (map lines,
basemaps, layers button, update handling). Only the service worker cache
version conflicted, and I set it above both sides. All tests passed on the
merged code (pushed as its own merge commit).
Looked at: onX Backcountry (route builder with distance, climb and the
hardest sections, but no time estimate based on your own pace) and a
separate paid app that only does pace-based time estimates. Budget used:
1 search, 0 fetches.
Changed: walking-time estimates (planned routes, the planner, multi-day
days) now fit your own pace. It's the median of recorded time ÷ rule
estimate over timed walks of 2 km or more, needs 3 walks, and is kept
between 0.5× and 2×. Settings has a "Walking times" card saying how you
compare ("18 % slower than the rule, breaks included") and a switch back
to the standard rule. `TrackCore.personalPace` has a unit test, plus an
e2e test. Service worker cache `waypoints-v22`.
For the owner: recorded durations include breaks, so estimates come out
as total time out, not moving time. Say if you'd prefer moving time.

## 2026-11-04 — research (3 of 3)

Looked at: FATMAP / Strava routes (FATMAP was shut down by Strava in
October 2024 and folded into Strava) and summit-log apps (yearly
summaries, highest point, busiest months, personal records, progress
toward peak lists). Budget used: 2 searches, 0 fetches.
Changed: the map overview has a "Year in review" line with a year picker
(every year you've walked in, newest first), for example "2 walks on 2 days
· 22 km · 1,490 m up / Longest: Gornergrat ridge, 14.2 km · Highest:
3,104 m on Gornergrat ridge · Busiest month: July". Planned routes don't
count. The numbers come from `TrackCore.yearSummary` (unit test); the
map e2e test checks the line.
Note: the first test run broke the whole page because a new global name
(`MONTHS`) clashed with one in `import.js`. Since all scripts share one
scope, I fixed it by reusing `MONTHS_LONG`, and checked that no other
global names are duplicated. All tests pass: 42 unit, 47 e2e.
For the owner: nothing to decide.

## 2026-11-04 — research (2 of 3)

Looked at: Outdooractive (tour planner with snap-to-path, filters by
length, ascent and duration) and Packstack / PackWizard (gear closet,
reusable kits, calorie planning, lighter-gear suggestions from a catalog).
Budget used: 2 searches, 0 fetches.
Changed: a planned trip's gear section now shows a food estimate, for
example "Food for 2 days: about 1.4–1.8 kg. Packed so far: 1 kg, 400 g
short." It uses the common rule of 700–900 g of food a day, takes the
number of days from the day split (1 day otherwise), and compares it with
the trip's Food items. It says "about right" when the packed food is
within range and "more than you'll likely eat" when it's well over. The
days e2e test checks all three messages.
For the owner: the 700–900 g a day rule is a rough guide for full hiking
days. Say if you'd rather have it in calories, or adjustable.

## 2026-11-04 — research (owner asked for several research days: 1 of 3)

Looked at: Komoot (route planner: one-way or round trip, adjustable pace
for time estimates, multi-day planner, community highlights) and AllTrails
(viewpoints, water sources and campsites along trails; custom routes).
Budget used: 2 searches, 0 fetches.
Changed: the route planner has a "Back to start" button on the map. It adds
one more leg, drawn the current way (trail or straight line), back to the
start point, and can be undone like any other change. It is greyed out until
there are two points, or once the route already ends at its start. Tested in
the route-planner e2e test. Service worker cache bumped to `waypoints-v16`.
For the owner: nothing to decide.

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
