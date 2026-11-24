# Daily log

Newest first. Each run: date, research or polish, what was looked at,
what changed, anything for the owner.

## 2026-11-24 — research (owner asked for 3 more research days: E of 3)

Looked at: reversing a planned route. komoot lets you reverse a route's
waypoints, and users note that you should check the route after doing so.
Budget used: 0 searches (from D's search), 0 fetches.
Changed: the route planner has a "Reverse" button on the map. It puts
the points in the opposite order and keeps how each leg was drawn (on
trails or a straight line), so the same path is fetched the other way.
The distance, climb, profile and difficulty update to match. Undo puts
it back. The route planner e2e test checks the points, the modes and
Undo. Service worker cache `waypoints-v61`. All tests pass: 62 unit,
66 e2e.
For the owner: nothing to decide.

## 2026-11-24 — research (owner asked for 3 more research days: D of 3)

Looked at: what route planners show while you draw. komoot's planner
shows distance, time and difficulty under the profile as the route
changes, and lets you reverse a route. Budget used: 1 search, 0 fetches.
Changed: the route planner's line under the map now ends with the same
difficulty label (Easy, Moderate, Hard, Strenuous) the trip page gives a
planned route, updating as you add, move or undo points. The route
planner e2e test checks it. Service worker cache `waypoints-v60`. All
tests pass: 62 unit, 66 e2e.
For the owner: nothing to decide.

## 2026-11-24 — research (owner asked for 3 research days: C of 3)

Looked at: gear-closet apps. HikerKit shows a usage rate per item, and
OutPack and PackTrack count how often each item was packed. Here the
gear cards already say "Used on N trips · last …", but there was no way
to see the most- and least-used gear together. Budget used: 1 search,
0 fetches.
Changed: the Gear Room's sort menu has "Sort: Most used", ordered by the
number of completed trips each item went on. Gear that was never used
comes last, so the end of the list shows what might not need keeping.
Planned trips don't count. New e2e test. Service worker cache
`waypoints-v59`. All tests pass: 62 unit, 66 e2e.
For the owner: nothing to decide.

## 2026-11-24 — research (owner asked for 3 research days: B of 3)

Looked at: how route planners finish a route. Gaia GPS, AllTrails,
HiiKER, Footpath and Apple Maps each have both "back to start" (one more
leg to the start) and "out and back" (the same way back). This planner
had only "Back to start". Budget used: 1 search, 0 fetches.
Changed: the route planner has an "Out and back" button on the map. It
adds the points in reverse, so the route goes back the same way, and
draws each leg back the way it went out (on trails or a straight line).
Undo takes it back off. It is disabled when the route already ends at
the start. The route planner e2e test checks the points and the modes.
Service worker cache `waypoints-v58`. All tests pass: 62 unit, 65 e2e.
For the owner: nothing to decide.

## 2026-11-24 — research (owner asked for 3 research days: A of 3)

Looked at: pack-planning apps (Packstack, OutPack, TrailBound, HikerKit,
PackTrack). They all split base, worn and consumable weight, which this
app already does; the other number lightweight hikers watch is the "big
three" (pack, shelter, sleep system), usually the heaviest part of the
base weight. Budget used: 1 search, 0 fetches.
Changed: a trip's gear shows a line like "Big three: 3.1 kg (pack 1.2 kg
· shelter 1.2 kg · sleep system 640 g) — usually the first place to save
weight." It counts the Backpack, Shelter and Sleep system categories and
is hidden when the trip has none of them. The packing e2e test checks
it. Service worker cache `waypoints-v57`. All tests pass: 62 unit,
65 e2e.
For the owner: nothing to decide.

## 2026-11-24 — polish

Looked at: phone screenshots (390 px) of a loadout page and a trip page,
measuring where each block starts and ends.
Changed: on a loadout page the breakdown card was indented twice (its
section's padding plus its own margin), so on phones it ran 36–354 px
while the stat cards above ran 12–378 px. The card no longer adds its own
margin inside a section, and on phones the sections use the same 12 px
sides as the stat cards. Trip pages share those sections, so their
daylight line, weather and track cards now line up with the stats too.
Desktop is unchanged apart from the loadout card matching its section.
Service worker cache `waypoints-v56`. All tests pass: 62 unit, 65 e2e.
Budget used: 0 searches, 0 fetches.
For the owner: nothing to decide.

## 2026-11-23 — research (owner asked for several research days: C of 3)

Looked at: multi-day stage planners. HiiKER, AllTrails Peak, komoot and
Bikemap all split a route into days and show each stage against the
elevation profile. Budget used: 1 search, 0 fetches.
Changed: when a planned trip is split into days, the planned route's
elevation profile on the trip page has a dashed line and a "Day 2",
"Day 3"... label where each day starts (also read out in the profile's
screen-reader label). The marks update as you change the daily distance
and go away when you clear it. They don't animate. The trips e2e test
checks the marks and the label. Service worker cache `waypoints-v55`.
All tests pass: 62 unit, 65 e2e.
For the owner: nothing to decide.

## 2026-11-23 — research (owner asked for several research days: B of 3)

Looked at: how much to drink by temperature. Trail Hiking Australia's
table gives about 0.35–0.5 L an hour of moderate walking at 15–25 °C,
0.45–0.65 L at 25–30 °C and more above that (double above about 32 °C);
REI's baseline is ½ L an hour. Budget used: 1 search, 0 fetches.
Changed: when a planned trip's forecast has loaded, the water line uses
the forecast high: 0.4 L an hour below 15 °C, 0.5 L to 25 °C, 0.65 L to
30 °C and 0.8 L above, and says which high it used, e.g. "(4 h 35 min of
walking, forecast high 28 °C)". Without a forecast it stays at ½ L an
hour as before. `TrackCore.waterLitresPerHour` has a unit test; the
weather e2e test checks the line. Service worker cache `waypoints-v54`.
All tests pass: 62 unit, 65 e2e.
For the owner: the rates are rough planning numbers, not medical advice;
the "up to" figure for heat or hard climbs is unchanged.

## 2026-11-23 — research (owner asked for several research days: A of 3)

Looked at: turnaround and start-time planning. Calculators (Trail
Hiking Australia) and WTA advice work back from sunset: the latest start
is the target finish minus the total time out, padded for breaks, with a
target finish about an hour before sunset. Budget used: 1 search, 0
fetches.
Changed: on a planned trip with a route, the daylight line adds the
latest start, e.g. "Day 1 is about 4 h 28 min with breaks: start by
1:55 PM to finish an hour before sunset." It uses the walking time already
shown (fitted to your pace) plus 10 minutes of breaks an hour, for the
whole route or the first day of a split trip. When it doesn't fit between
sunrise and sunset, it says so and suggests splitting into days.
`TrackCore.latestStart` has a unit test; the trips e2e test checks the
sentence. Service worker cache `waypoints-v53`. All tests pass: 61 unit,
65 e2e.
For the owner: times are in the device's time zone, as for sunrise and
sunset.

## 2026-11-23 — research

Looked at: water planning. NOLS and REI suggest about ½ L an hour of
moderate walking, rising to about 1 L an hour in heat or on hard climbs.
Trail Estimator works out water for a route, FarOut shows the distance to
the next water source, and HIIKER marks refill points. Budget used: 2
searches, 0 fetches.
Changed: planned trips with a planned route show a water line under the
food estimate, e.g. "Water: about 2.5 L on the longest day (4 h 35 min
of walking) — up to 4.5 L in heat or on hard climbs. Plan where to
refill." It uses the walking time already shown (fitted to your pace),
rounded to the half litre. It covers the whole route, or the longest day
when the trip is split into days. "Plan where to refill" is added for
multi-day trips and walks over 4 hours. Nothing new is saved. The days e2e
test checks both forms. Service worker cache `waypoints-v52`. All tests
pass: 60 unit, 65 e2e.
For the owner: these are rough planning numbers. The trip's forecast
could raise the figure on hot days, if you'd like that.

## 2026-11-22 — polish

Looked at: phone screenshots of the Gear Room and a loadout page. With no
prices entered, the Gear Room's "Total value" tile said "0", which reads
as if the gear were worth nothing, while other empty stats (metres
climbed) show "—".
Changed: the tile shows "—" until an item has a price, with a hover hint
on how to add one ("More details" in the gear form). Once prices exist it
shows the sum as before, with a hover note like "2 of 4 owned items have
a price". New e2e test. Service worker cache `waypoints-v51`. All tests
pass: 60 unit, 65 e2e.
Noticed for later: on phones the breakdown panel on a loadout page is
narrower than the rest of the page.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-21 — research

Looked at: gear apps that put a value on use. HikerKit (statistics with
cost per use and trip value), PackTrack (cost per adventure), Kit Book
(lifetime cost net of resale), and Packstack, Hikt and OutPack
(gear closet, weights, packing lists). Budget used: 2 searches, 0 fetches.
Changed: Gear Room cards show what each completed trip has cost so far,
e.g. "€100 per trip so far" for a €300 shell used on 3 completed trips.
It falls as the gear gets used. It's shown only when the item has a price
and has been on at least one completed trip, and planned trips don't
count. It uses the item's currency and the existing money format, and
nothing new is saved. New e2e test. Service worker cache `waypoints-v50`.
All tests pass: 60 unit, 64 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-20 — polish

Looked at: keyboard focus across the app's controls, following last
week's card focus rings. Buttons, segmented toggles, links and inputs
already shared one green ring. Select menus outside forms (breakdown
metric, "Apply a loadout…", gear status filter and sort, year picker) got
the browser's own dark ring instead, and so did textareas outside forms.
Changed: select menus and textareas get the same 2 px ring as everything
else. Form fields keep their own focus style (thin brass outline and
border), because their rule is more specific. CSS only. New e2e test
compares the select's ring with a button's and checks a form field keeps
its own. Service worker cache `waypoints-v49`. All tests pass: 60 unit,
63 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-19 — research

Looked at: gear-wear reminders. Strava emails when shoes pass a distance
you set, and keeps reminding until they're retired. Garmin Connect
notifies at a "max distance" you choose. The app already tracks walked
km against each item's lifespan (the wear meter on Gear Room cards), but
said nothing where it matters: when packing that gear for the next trip.
Budget used: 2 searches, 0 fetches.
Changed: on a planned trip, gear at 90 % or more of its lifespan gets a
"Replace soon" badge, and gear past it gets "Worn out", both in the gear
list and in packing mode. One line above the list names them ("⚠ Trail
shoes and Poles are at or near the end of the lifespan you set."). Past
trips don't show it. It uses the same wear calculation as the Gear Room,
and nothing new is saved. New e2e test. Service worker cache
`waypoints-v48`. All tests pass: 60 unit, 62 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-18 — polish

Looked at: the Settings page on a device with no timed walks. The
"Fit estimates to my own pace" box showed ticked but greyed out, which
read as a setting that was on even though there was no pace to use yet.
Changed: the switch is hidden until there are 3 timed walks to work out a
pace from. Before that, the card only explains the standard rule and
what's needed. Once a pace exists, the switch appears and works as
before. The pace e2e test now checks that the switch is hidden, then
shown. Service worker cache `waypoints-v47`. All tests pass: 60 unit,
61 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-17 — research

Synced: main had a new commit from another session (GR progress counts
only real GR sections). It fast-forwarded with no conflicts.
Looked at: SummitLynx (a hiking diary with entries, photos and comments,
badges, statistics) and "on this day" memory features. A journaling app
(Day One) has one, hikers ask for "one year ago today" in their apps, and
none of the hiking apps I found offers it. Budget used: 2 searches, 0
fetches.
Changed: the Trips page shows a small memory card when a completed trip
happened in the same week (±3 days) of an earlier year, e.g. "1 year ago
this week: Bergsee loop, Sat 15 Nov 2025 · 11.4 km". It says "today" on
the exact day, and the most recent year wins. Tapping it opens the trip.
Nothing shows when there's no match, and nothing new is saved.
`TrackCore.onThisDay` has a unit test, plus a new e2e test. Service worker
cache `waypoints-v46`. All tests pass: 60 unit, 61 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-16 — polish

Looked at: the Gear Room's "All items" list on a phone. Status badges read
"active", "retired" and "wishlist" in lower case, unlike the trip badges
("Planned", "Completed"). Retired gear and wishlist items looked exactly
like gear in use.
Changed: gear status badges are capitalised ("Active", "Retired",
"Wishlist"). This is display only; the saved value is unchanged. Retired
cards get a softer background with lighter name and weight. The tone
was picked to keep 4.7:1 contrast; my first try at 3.2:1 was too faint.
Wishlist cards are drawn with a dashed border and no fill. Cards now carry
their status as a class (`is-retired` etc.). New e2e test. Service worker
cache `waypoints-v44`. All tests pass: 57 unit, 60 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-15 — research

Looked at: Cairn (trail-safety app: a trip plan with where, what and when
you'll be back, sent to emergency contacts, alerts if you're overdue, live
location) and trip-plan guidance from park services and trail groups
(route with a map, distance, climb, time, return time with a buffer, and
when your contact should call for help). Budget used: 2 searches, 0
fetches.
Changed: planned trips with a route get a "Trip plan" button. It shares
(or copies) a plain-text plan to leave with someone at home: the trip name
and date, the route with distance, climb and walking time (fitted to your
pace), the start as an OpenStreetMap link, each day when the trip is split
into days, and the notes. It ends with blanks to fill in: who's going,
when you'll be back, and when to call for help. Nothing new is saved or
sent anywhere by the app. Overdue alerts and live tracking would need a
server, so they're left out. The trip page's buttons now wrap neatly on
phones. New e2e test reads the copied plan. Service worker cache
`waypoints-v43`. All tests pass: 57 unit, 59 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-14 — polish

Looked at: the forecast card on a planned trip page while it loads. It
showed a plain "Loading the forecast…" line, and the card jumped in size
when the forecast arrived.
Changed: while loading, the card shows its heading and two placeholder
rows shaped like forecast lines, with a soft sheen passing over them. They
are announced to screen readers as "Loading the forecast". The sheen loops
(1.2 s) until the forecast arrives, which is longer than the 150–300 ms
guideline for transitions but never blocks input. Reduced motion shows
still bars. The weather e2e test now holds back the mocked forecast to
check the placeholders, then that they are replaced. Service worker cache
`waypoints-v42`. All tests pass: 57 unit, 58 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-13 — research

Looked at: Footpath (draw a route with your finger, snapped to trails;
slope colouring; distance and climb at any point along the route;
adjustable speed) and Relive (animated recap videos; photos pinned where
they were taken). Budget used: 2 searches, 0 fetches.
Changed: in the route planner, pointing at the elevation profile (mouse,
touch or the arrow keys) shows that spot as a dot on the map; moving away
removes it. `buildElevationProfile` takes an optional callback with the km
under the cursor. `TrackCore.pointAtKm` finds the spot, scaled to the
profile's length, and has a unit test. The route-planner e2e test checks
the dot. Service worker cache `waypoints-v41`. All tests pass: 57 unit,
58 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-12 — polish

Looked at: trip cards and the next-trip card. They act as buttons (open a
trip, reachable by Tab), but only their border colour changed on hover.
There was no press feedback and no clear focus ring for keyboard users.
Changed (CSS only): trip cards, the next-trip card and the full-width row
links lift by 1 px with a soft shadow on hover (pointer devices only), press
in slightly when tapped, and show a green focus ring for keyboard focus.
With reduced motion, only the colour and shadow change, with no movement. New
e2e test (hover lift, focus ring, reduced motion). Service worker cache
`waypoints-v40`. All tests pass: 56 unit, 58 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-11 — research

Synced: main had a new commit from another session (GR routes in the
route planner and the overview). The service worker conflicted on both the
cache version and the app's file list. main added `gr-routes`, and my
first resolution dropped the file-list line. The updates e2e test caught
it, and I restored main's list exactly (cache `waypoints-v38`). A second
run then hit an intermittent failure in the backup test: it read the
"isn't a backup" message before the file had been read. The test now waits
for the message. 2 full runs in a row passed (57/57).
Looked at: Locus Map (planner with elevation profile, surfaces and way
types; route line coloured by steepness to avoid steep climbs; share a
route by link) and OsmAnd (split a track by time, distance, or
uphill/downhill/flat; track analysis on the map). Budget used: 2 searches,
0 fetches.
Changed: each hike on a trip page gets a line saying how its distance
splits between climbing, descending and about level ground, e.g. "4.0 km
up · 5.6 km down". It's judged over 100 m stretches, with ±3 % counting as
flat. `TrackCore.gradeBreakdown` has a unit test, plus the trips e2e test.
Service worker cache `waypoints-v39`. All tests pass: 56 unit, 57 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-10 — polish

Synced: main had a new commit from another session (show my location on
the map, following until the map is dragged). Only the service worker
cache version conflicted; I set it above both sides. All tests passed on
the merge, which was pushed as its own commit.
Looked at: focusing a trip on the map ("View on map" or a track's popup).
The "Showing … · Show all" chip, the kilometre markers and the high-point
label all popped in at once.
Changed: the chip slides in from the left (200 ms) whenever what's in
focus changes. The markers and the high-point label fade in once (220 ms)
the first time they show for a new focus. The map redraws them on every
pan and zoom, so they don't fade again then. Off under reduced motion. The
map e2e test checks the fade, that panning doesn't replay it, and the chip
animation. Service worker cache `waypoints-v37`. All tests pass: 49 unit,
56 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-09 — research

Synced: main had a new commit from another session (Download GPX for
Garmin, whole route or per day). Only the service worker cache version
conflicted; I set it above both sides. All tests passed on the merge,
which was pushed as its own commit.
Looked at: Peakbagger (log ascents, filter peaks by climbed or not,
custom peak lists), Trailforks (trail reports with photos pinned to a
spot) and Wikiloc (waypoints and photos along recorded routes). Budget
used: 2 searches, 0 fetches.
Changed: on the main map, the trip or hike in focus also marks where it
tops out, with a small "▲ 2,412 m" label at its highest point. Walks with
under 30 m between their lowest and highest points get no label. It uses
the track's per-point elevation, or the profile for older tracks
(`TrackCore.highestPoint`, unit test; the map e2e test checks the label).
A small step toward the peak-list idea without needing summit data.
Service worker cache `waypoints-v35`. All tests pass: 49 unit, 55 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-08 — polish

Looked at: screenshots (phone) of a trip page, Settings and the map
sidebar. In the Year in review, the summary rounded distance to whole
kilometres ("10 km"), while the line under it and Personal bests showed
"9.6 km" for the same walk. Switching years swapped the text abruptly.
Changed: the year summary shows one decimal under 100 km (e.g. "9.6 km";
larger totals stay short like "1.2k"). Picking another year fades the new
numbers in (200 ms), replayed on each change and off under reduced motion.
The map e2e test checks the decimal and the fade. Service worker cache
`waypoints-v33`. All tests pass: 47 unit, 54 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-07 — research

Looked at: Mapy.com (A-to-B and round-trip planning with time, distance
and climb; custom speeds; users asking for a "terrain profile ahead") and
bergfex (tap start and end for distance, climb and time; intermediate
stops; GPX in and out). Most of this the app already has (round trips,
your own pace, GPX). Budget used: 2 searches, 0 fetches.
Changed: kilometre markers, until now only in the route planner, also
show on the main map for the trip or hike in focus (from "View on map" or
a track's popup), once zoomed in as far as the start and finish dots, and
on the shared-route page partners open. They sit in their own map layer
(`trackKmGroup`), so the start/finish dots layer is unchanged. The marker
style is now one shared class (`km-marker`). E2e tests cover the map
(markers only while something is in focus) and the shared page. Service
worker cache `waypoints-v32`. All tests pass: 47 unit, 54 e2e.
For the owner: nothing new. The category-colour question in backlog.md is
still open.

## 2026-11-06 — polish

Looked at: the backlog item "Gear breakdown donut should use the category
colours". I checked the 13 category colours against the chart background
(#DAD7CD): Water 2.7, Electronics 2.6, Hygiene 2.4, Food 2.6 and Other
1.6 are below the 3:1 contrast that chart shapes need. The donut's own
palette was chosen to stay apart for colour-blind viewers. So switching
the donut would make it harder to read, and fixing it properly means
changing the category colours themselves (dots, shelf scene, donut). I
left it as a question for the owner.
Changed instead: in the Gear Room list, opening a category makes its items
fade in and drop into place (200 ms, 30 ms apart). Only the category just
opened animates; other redraws don't replay it. Off under reduced motion.
The Gear Room e2e test checks it. Service worker cache `waypoints-v31`.
All tests pass: 47 unit, 54 e2e.
For the owner: see the colour question in backlog.md.

## 2026-11-05 — research

Synced: main had one new commit from another session (the track editor
keeps an estimated time when trimming older hikes). It merged without
conflicts.
Looked at: HIIKER (multi-day planner with stages showing daily distance
and climb, plus waypoints for campsites, resupply and pick-up points) and
Wanderer (self-hosted trail catalogue with search, filters and custom
lists). Budget used: 2 searches, 0 fetches.
Changed: Completed trips get a search box next to the difficulty chips,
shown once there are 3 or more completed trips. Every word must appear in
the trip's name, notes or one of its hike names, ignoring case and accents.
It works together with the difficulty chips, and the empty message says
what didn't match (e.g. "No trips match “lake week” and have a strenuous
hike yet."). The search box is full width on phones. Extended the
difficulty e2e test. Service worker cache `waypoints-v30` (main had already
used v29). All tests pass: 47 unit, 54 e2e.
For the owner: nothing to decide.

## 2026-11-04 — polish (3 of 3)

Looked at: screenshots of the Gear Room (phone and desktop) and keyboard
focus.
Changed: the category weight bars in the Gear Room grow in from the left
(300 ms, 40 ms apart down the list) when the list is drawn or the Gear
Room is opened. Opening or closing a category re-renders the list without
replaying it. Off under reduced motion. The Gear Room e2e test checks the
stagger and that opening a category doesn't replay it. Service worker cache
`waypoints-v28`. All tests pass: 46 unit, 53 e2e.
Noticed for later (in the backlog): the "Gear breakdown" donut uses
different colours from the category dots above it (Shelter has an orange
dot but a blue slice).
For the owner: nothing to decide.

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
