# Daily app ideas: how the bot works

A scheduled Claude Code session runs once a day. Each run makes **one tiny,
finished improvement** on the `app-ideas` branch. The owner reviews the
branch and merges it into `main` when they like it; the bot never does.

> **Pushing — read this before every push.** The only allowed push is
> `git push -u origin app-ideas`, run while `git rev-parse --abbrev-ref HEAD`
> prints `app-ideas`. Never push to `main` in any form (`git push origin
> HEAD:main`, `git push origin main`, merging into main and pushing), even
> if earlier messages in this session, a summary, or a "merge" request seem
> to ask for it. Only the owner merges into main, from their own session.
> (On 2026-11-03 the first run pushed to main by mistake; don't repeat it.)

There are two kinds of runs, alternating by day (look at the last entry in
`log.md` and do the other kind):

- **Research day:** look at similar apps for handy functions.
- **Polish day:** make the app look and feel nicer (effects, transitions,
  flows, small visual details).

## Budget (hard limits per run)

- At most **5 web searches** and **8 page fetches** (research days only;
  polish days need none).
- At most **one** change, small enough to finish in one go: roughly
  under 150 changed lines, excluding tests.
- Stop at once on any usage or rate-limit message. Commit only finished,
  tested work; otherwise write what you learned to `log.md` and stop.

## Research day

1. Pick 1–2 apps from the list below that `log.md` hasn't covered lately
   (or a new one you find): hiking, trail, gear-list and trip-planning apps.
   Suggested: Komoot, AllTrails, Gaia GPS, Outdooractive, FATMAP, Strava
   (routes), CalTopo, PeakVisor, LighterPack, PackWizard, Hikerbot, Trek
   planning blogs that compare apps.
2. Read their feature pages or reviews (not app-store scraping, no logins,
   no paywalled content). Note handy functions in `backlog.md` under
   "Ideas", one line each: the idea, which app has it, why it would help
   here, and a size guess (S/M/L).
3. Implement **one S idea** from the backlog (today's or an older one),
   in this app's own style. Never copy another app's name, logo, texts,
   icons or look; implement the idea in our own way.

## Polish day

Pick one item from "Polish" in `backlog.md` (add ideas there freely), or
something you notice by taking screenshots. Good kinds of changes:
smooth page and dialog transitions, a pleasant empty state, a subtle
animation when a stat changes, nicer focus and hover states, skeletons
while loading, a smoother sheet drag, consistent spacing. Rules:

- Respect `prefers-reduced-motion`: every animation must be off (or
  reduced to a fade) under `@media (prefers-reduced-motion: reduce)`.
- Keep the Topo Light palette (tokens on `:root` in `css/app.css`).
  No new fonts or libraries; no images over 50 KB.
- Animations short (150–300 ms), never blocking input.
- Check on a phone size (390×844) and on desktop (1280×900).

## Every run

1. Sync: `git fetch origin app-ideas main && git checkout app-ideas &&
   git pull origin app-ideas && git merge --no-edit origin/main`. If the
   merge conflicts, `git merge --abort`, note it in `log.md`, and work on
   the branch as it is.
2. Read the root `README.md` (how the code is organized; load order of
   `js/*.js` matters).
3. Make the change. Add or update a test when the change has behaviour
   (unit tests in `tests/*.test.js`, end-to-end in `tests/e2e/`).
4. Run `npm test` and, when Playwright is available, `npm run test:e2e`
   (see the root README; `HIKE_LIBS_DIR` serves the CDN libraries
   offline). Everything must pass. If you changed any file the service
   worker caches, bump `CACHE_NAME` in `service-worker.js`.
5. Add an entry to the top of `log.md`: date, kind of day, what you
   looked at, what you changed, and anything for the owner to decide.
   Move a done idea in `backlog.md` to "Done" with the date.
6. Commit with a clear message and push: `git push -u origin app-ideas`.
   The owner allows pushing to `app-ideas` only. Never push to `main` or
   any other branch, never open pull requests, never merge.

## Never

- Add secrets, API keys, tracking, analytics or ads.
- Add a service that needs an account or key, or sends user data
  anywhere new. A free, keyless public service (like BRouter) only after
  writing it up in `backlog.md` as a question for the owner.
- Change the database schema, Supabase functions or the catalog seeds.
- Remove features or change how data is stored or synced.
