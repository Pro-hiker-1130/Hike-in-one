# From web app to App Store and Google Play

Hike-in-one today is an installable web app (PWA) on GitHub Pages. This is
the workflow to turn it into real apps in Apple's App Store and Google Play,
without rewriting it, and while the web version keeps working.

## The approach: wrap the existing app with Capacitor

| Option | What it means | Verdict |
| --- | --- | --- |
| **Capacitor** (Ionic) | The same HTML/CSS/JS runs inside a native iOS and Android app, with plugins for GPS, files, sharing and more. | **Recommended.** Keeps all current code; adds the native features a store app needs. |
| Trusted Web Activity (Bubblewrap / PWABuilder) | Android-only shell that opens the website full screen. | Fine for a quick Play Store presence, but no iOS and no native features. |
| Rewrite (React Native, Flutter, Swift/Kotlin) | Build the app again natively. | Months of work for little gain at this stage. |

Capacitor 8 is current (8.6, November 2026). The app has no build step and
plain scripts, which is exactly what Capacitor needs: it serves a folder of
web files from inside the app.

## Phase 0 — Decisions and accounts (owner, ~1 day)

- **Platforms:** Android first (cheaper, faster review, builds without a
  Mac), then iOS; or both at once.
- **Developer accounts:**
  - Google Play Console: one-time US$25. New personal accounts must run a
    closed test with at least 12 testers for 14 days before the first public
    release, so recruit hiking friends early.
  - Apple Developer Program: US$99 per year. Needed for TestFlight and the
    App Store.
- **App identity:** final name, app id (e.g. `app.hikeinone`), a website
  or page for the privacy policy and support.
- **Free or paid:** decides whether paid map tiles and service plans are
  affordable (see Phase 3).

## Phase 1 — Make the web app wrappable (Claude, ~1–2 sessions)

1. **Bundle the libraries.** Leaflet, Leaflet.heat, ZXing, Supabase and
   MapLibre load from CDNs today. A store app should not depend on them:
   copy the pinned versions into `vendor/` and load them from there (the
   web version can keep using the same files).
2. **A `www/` build folder.** A small script copies the app files into
   `www/` for Capacitor (no bundler needed).
3. **Sign-in that works inside an app.** Replace the email magic link with
   a 6-digit email code typed into the app (Supabase supports this:
   `signInWithOtp` + `verifyOtp`). Works the same on the web.
4. **Delete account.** Settings → "Delete my account and data", removing the
   cloud copy (a Supabase Edge Function, since only the server may delete a
   user). Apple requires this for any app with sign-in.
5. **Platform checks.** One helper `isNativeApp()`; the service worker and
   "Check for updates" are web-only (store apps update through the store).

## Phase 2 — Wrap with Capacitor (Claude for Android; iOS needs a Mac or cloud Mac)

1. Add Capacitor (`@capacitor/core`, `cli`, `android`, `ios`) and
   `capacitor.config.json`.
2. Generate the `android/` and `ios/` projects and commit them.
3. Swap web APIs for native plugins where they behave better:
   - Geolocation → `@capacitor/geolocation` (proper permission prompts).
   - Saving files (GPX, backup, CSV) → `@capacitor/filesystem` +
     `@capacitor/share`.
   - Android back button → `@capacitor/app` (closes dialogs first).
   - Status bar and splash screen, app icon set.
4. **Builds in GitHub Actions**, so nobody needs Android Studio or Xcode
   locally:
   - Android: a workflow that builds a signed `.aab` (store) and an `.apk`
     (install on your own phone). Signing key stored as a GitHub secret.
   - iOS: a macOS runner with fastlane, uploading to TestFlight. Needs the
     Apple account, certificates and an App Store Connect API key as
     GitHub secrets.

## Phase 3 — What makes it a real app (Claude, several sessions)

Apple rejects apps that are "just a website in a box" (guideline 4.2).
These features give the app a reason to exist, and hikers want them:

1. **Record a hike** with the screen off: background GPS
   (`@capacitor-community/background-geolocation`), pause/resume, live
   distance, time and climb, saved as a track. This is the big one: today
   the app can only import hikes recorded elsewhere.
2. **Offline maps for a planned trip:** download the map tiles around a
   route before leaving. This needs a tile provider that allows offline use
   (see below).
3. Native share sheet for GPX files (to Garmin Connect, Files, AirDrop).
4. Optional later: Apple Health / Health Connect export, home-screen widget
   with the next trip countdown.

## Phase 4 — Rules, privacy and third-party services (Claude drafts, owner decides)

- **Map tiles.** The free OpenStreetMap and OpenTopoMap servers are meant
  for light use and forbid offline downloads. A store app should use a
  provider with an app plan, e.g. MapTiler, Stadia Maps or Thunderforest
  (free tiers exist; offline use is usually a paid feature).
- **Other services:** Open-Meteo is free for non-commercial use (a paid
  plan if the app is paid); BRouter, Waymarked Trails and Maptoolkit are
  community services. If the app gets popular, contact them or host BRouter
  ourselves.
- **Strava:** follow Strava's API agreement and brand guidelines ("Powered
  by Strava" logo, rate limits). The secret stays in the Edge Function.
- **Privacy policy** page (what is stored on the device, in Supabase, what is
  sent to which service), plus Apple's privacy labels and Google's Data
  Safety form.
- **Age rating** questionnaires, export compliance (standard HTTPS only).

## Phase 5 — Test and release (owner + Claude)

1. Internal testing: TestFlight (iOS) and Play internal testing (Android)
   for the owner.
2. Closed testing on Google Play: ≥12 testers for 14 days.
3. Store listings: name, short and long description, screenshots for phone
   and tablet (Claude can generate these with the test browser), 1024×1024
   icon, feature graphic for Play.
4. Submit for review. Apple usually answers within one to two days; plan
   for a rejection round on the first submission.
5. Release; keep the PWA on GitHub Pages for people without the app.

## After release

- Version numbers in one place, bumped per release; a changelog.
- The daily ideas bot keeps working on the web code; releases bundle its
  merged changes into a store update every few weeks.
- Crash and error reports (e.g. Sentry's free tier) once there are users.

## Rough timeline

| Week | Work |
| --- | --- |
| 1 | Phase 0 accounts; Phase 1 (vendor libs, code sign-in, delete account) |
| 2 | Phase 2 Android build in GitHub Actions; install on your phone |
| 3–4 | Phase 3 hike recording; tile provider chosen; privacy policy |
| 4–5 | iOS build via cloud Mac, TestFlight; Play closed test starts (14 days) |
| 6–7 | Store listings, review, release |
