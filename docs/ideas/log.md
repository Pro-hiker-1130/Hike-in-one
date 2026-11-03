# Daily log

Newest first. Each run: date, research or polish, what was looked at,
what changed, anything for the owner.

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
