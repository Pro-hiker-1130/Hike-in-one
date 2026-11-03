# Daily log

Newest first. Each run: date, research or polish, what was looked at,
what changed, anything for the owner.

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
