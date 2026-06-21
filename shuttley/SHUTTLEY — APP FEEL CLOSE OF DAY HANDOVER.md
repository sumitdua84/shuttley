# Shuttley — App Feel Close of Day Handover (2026-06-21)

Session closed for the night. This is the single restart-from-cold
document for the `feature/shuttley-app-feel-upgrade` branch. For full
play-by-play detail on any item below, see `ISSUES.md` and
`CHANGELOG.md` in this folder.

## Current branch

`feature/shuttley-app-feel-upgrade`

Off `develop`. Clean working tree. **Never pushed** (no remote
tracking ref exists for this branch) — so by definition nothing on it
has been merged or deployed anywhere.

## Latest commits

```
13ce90f Fix Shuttley PWA install and update QA blockers
1e24e08 Verify Shuttley rotation scheduling after dev schema fix
165629e Fix Shuttley rotation scheduling QA blockers
d59dc4e Fix Shuttley member removal and demotion QA blockers
571c84a Docs: update Shuttley app-feel QA handover
428abe6 Fix Shuttley splits, chat, and account deletion QA blockers
dd06c68 Document Shuttley app-feel stopping point and V2 handover
3d991ed Fix SessionSummary PGRST201 by removing an unused profiles embed
fe780eb Note orphaned note columns found on shuttley-dev
106afa2 Verify Shuttley app-feel flows with member test data
```

This handover file itself lands in a docs-only commit on top of
`13ce90f` — see `git log` for that commit's hash.

## Completed and verified this session

- **Splits** — fixed and verified on shuttley-dev.
- **Chat** — fixed, polished, duplicate "All Members" conversation race
  fixed, converted to one mobile-first layout, verified end-to-end.
- **Account deletion / admin** — fixed in code (schema, RPC, table
  reference, admin-visibility endpoint). **Still needs a Vercel runtime
  test** — Vercel serverless functions don't execute under local
  `vite dev`, so this has never actually been exercised end-to-end.
- **Member removal/demotion** — fixed (last-admin protection,
  promote-confirmation) and verified end-to-end against shuttley-dev.
- **Rotation Auto Schedule** — error-handling fixed in code first
  (toast + rollback instead of a silent broken session).
- **`rotation_matches` shuttley-dev schema** — fixed manually by Sumit
  in the Supabase SQL editor (dev only), per SQL flagged in `ISSUES.md`.
- **Auto Schedule** — fully re-verified end-to-end after the schema
  fix: start session, score a match, New Cycle, Rebalance, all
  consistent across `rotation_matches`/`matches`/`match_players`.
- **Free Play** — regression-tested, unaffected by any rotation work.
- **PWA install/update QA** — completed locally using the real
  production build (`vite preview`), since `vite dev` disables the
  service worker entirely.

## PWA details

- `vite dev` disables the service worker (`devOptions.enabled: false`
  in `vite.config.js`), so `vite preview`/the real production build
  was required to test SW/manifest/install behavior at all.
- The local production build initially rendered **blank** — caused by
  missing local env vars (`vite build` defaults to `mode=production`,
  and no `.env.production`/`.env.local` exists locally), **not an app
  bug**. The real Vercel production deployment has its own env vars.
- `.env.production.local` was created locally (copied from
  `.env.development`'s shuttley-dev credentials) purely to get the
  build to render for testing. **It must never be committed.**
- The `.env.production`/`.env.production.local` gitignore gap was
  fixed — they weren't previously listed alongside
  `.env.local`/`.env`/`.env.development`.
- Manifest verified (valid JSON, fetches 200).
- Icon integrity verified (all 5 icon files' actual pixel dimensions
  confirmed via PNG IHDR-chunk inspection to match their filenames and
  manifest declarations).
- Service worker registration/activation verified
  (`active.state: "activated"`).
- Install-prompt UI tested via a synthetic `beforeinstallprompt`
  event — the "+ Add Shuttley to Home Screen" button correctly
  appeared and the prompt/userChoice flow ran with no errors.
- Offline-fallback precaching verified (`index.html` confirmed present
  in the 35-entry Workbox precache manifest).
- Silent no-stale-version auto-update design verified by code review:
  `sw.js`'s `skipWaiting()`/`clients.claim()` plus `App.jsx`'s
  `AutoUpdate` component forcing a full reload the instant an update
  is detected — no user prompt, by design, but also no stuck state.
- Mobile layout clean at 390×844.
- No console errors at any point during this QA pass.

## PWA fixes committed

- Removed a dead `<link rel="icon" href="/logo.svg">` reference in
  `index.html` (the file doesn't exist anywhere in the repo — was
  silently served as the SPA's `index.html` fallback instead of a real
  icon) and the matching dead entry in `vite.config.js`'s
  `includeAssets`.
- Fixed `theme-color` in `index.html` from a stale, unused dark navy
  (`#0d1321`, matching no theme that exists in the CSS) to `#256575`,
  matching the manifest and the app's actual teal/white design.
- Documented (not fixed — needs a real image asset) the maskable-icon
  safe-zone issue: see "Important unresolved/optional issues" below.

## Still pending before production polish release

1. Vercel preview readiness.
2. Account deletion Vercel runtime test.
3. Manual iPhone/Safari PWA install test.
4. Manual Android/Chrome PWA install test.
5. Manual update-while-installed test.
6. Optional: Add Guest RPC/schema-drift fix.
7. Optional: maskable icon safe-zone asset improvement.

## Important unresolved/optional issues

- **Add Guest is broken on shuttley-dev** — the `create_guest_profile`
  RPC function is missing (confirmed via direct call returning
  `PGRST202`). Same schema-drift pattern as previously-fixed bugs, but
  a separate, unrelated feature. Spun off as its own background task,
  not fixed in this branch.
- **Maskable icon is byte-identical to the regular 512px icon.**
  `public/maskable-icon-512x512.png` has no safe-zone padding (a
  maskable icon needs the logo confined to roughly the center 80%,
  since platforms apply shape masks that can clip anything outside
  that zone). May clip on aggressive maskable-icon platforms (e.g.
  Android adaptive icons). Needs a new image asset — not a code fix.
- **`memberships` DELETE RLS may permit self-delete at the DB level.**
  The policy's `USING` clause includes `user_id = auth.uid()`, which
  technically allows a user to delete their own membership row
  directly, bypassing the UI's self-removal guard. No current UI
  feature uses self-delete (there's no "Leave Club" button), so this
  isn't exploited today — documented in `ISSUES.md` with a suggested
  tightened policy, but **not changed**, since it's unclear whether a
  future "Leave Club" feature will need that same self-delete path.

## Do not do yet

- Do not merge to `develop`.
- Do not merge to `main`.
- Do not deploy production.
- Do not touch production Supabase.
- Do not start V2.
- Do not run production SQL.
- Do not commit `.env.local.disabled`.
- Do not commit `.claude/launch.json` unless explicitly approved.
- Do not commit `.env.production.local`.
- Do not commit any `.env` file.
- Do not paste or expose secrets.

## Strategy decision

**We will finish and ship the current production polish/app-feel
upgrade first.**

**V2 will start later as a separate architecture phase/branch, not
inside this polish branch.**

V2 direction later:

- Current clubs become **Groups**.
- Real venues/clubs become separate **Venues**.
- Groups can use multiple Venues.
- A venue/club management portal.
- Bookings/court availability.
- Migration from the current live app only after V2 itself is fully
  tested.

See `SHUTTLEY-V2-ARCHITECTURE.md` (on the separate
`docs/shuttley-v2-architecture-planning` branch) for the full planning
document. That branch is planning-only — no code on it, and V2
implementation does not begin until this app-feel branch is fully
parked or merged.

## Next recommended restart task

**Vercel preview readiness.**

After that: **Account deletion Vercel runtime test.**

**Do not start V2 yet.**
