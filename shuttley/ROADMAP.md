# Shuttley — Roadmap

## Status: LIVE IN PRODUCTION - 2026-06-30

V1 app-feel is live in production at `c530631` (docs closeout; app-code state `a56d509`). V2 has not started; begin V2 from current `main` in a separate branch/session.

Full closeout context: `SHUTTLEY - V1 PRODUCTION RELEASE CLOSEOUT HANDOVER.md`.

---
## Status: MERGED to develop — 2026-06-29

`feature/shuttley-app-feel-upgrade` merged to `develop` via PR #2 (merge commit `73860e9`).
See `SHUTTLEY — V1 APP-FEEL POST-MERGE HANDOVER.md` for the full post-merge summary.
Next: shuttley-dev Vercel setup → HTTPS PWA install QA → release readiness decision.

---

## App-Feel Upgrade (`feature/shuttley-app-feel-upgrade`) — MERGED

Controlled frontend/UX upgrade. No new features, no schema changes, no
production deploys until tested. See [PROJECT.md](PROJECT.md) for full
context and audit findings.

- [x] Phase 0 — Audit current app, confirm branch strategy, write docs
- [x] Phase 1 — Safe app-feel improvements
  - [x] Skeleton loading states — `DashboardSkeleton` used on
        `MemberDashboard`, `ModeratorDashboard`, `RotationPage`, `SessionSummary`
  - [x] Subtle route transitions (180ms fade) wrapping `<Routes>` in `App.jsx`
  - [x] Replace `alert`/`confirm`/`window.confirm` with shared `Toast` +
        `ConfirmModal` (via `useConfirm()`) across all 7 affected pages
  - [ ] Reduce/remove janky or continuous animations — reviewed; existing
        animations (`splash` pulse, `toastin`, `tileIn`) are already short
        and subtle, nothing found worth changing
  - [x] Remove stray debug `console.log` — only 1 existed, left as-is
        (legitimate error logging, not noise)
  - [x] Verify mobile safe-area / bottom-nav / keyboard behaviour — already
        correctly wired via `env(safe-area-inset-*)`, no changes needed
- [x] Phase 2 — Performance and data loading (partial)
  - [x] Route-level code splitting (`React.lazy` + `Suspense`) in `App.jsx` —
        main bundle 692.99 KB → 394.10 KB (181.14 KB → 112.89 KB gzip)
  - [x] Parallelize independent Supabase calls (`Promise.all`) in
        `MemberDashboard.jsx` and `ModeratorDashboard.jsx` `fetchData()`
  - [ ] Add limits/filters to large queries — deferred, not yet needed
  - [ ] Extract shared data hooks (`useClubData`, `useMembers`, etc.) —
        deferred to Phase 3 component cleanup
  - [ ] Assess React Query / caching — deferred, no clear need yet
- [ ] Phase 3 — UI consistency and component cleanup
  - [ ] Shared components: `Skeleton`, `Toast`, `ConfirmModal`, `EmptyState`,
        `StatCard`, `ListRow`, `SectionHeader`, etc.
  - [ ] Begin breaking down `ModeratorDashboard.jsx`, `MemberDashboard.jsx`,
        `MatchesPage.jsx` incrementally — only where safe
- [ ] Phase 4 — PWA / mobile app polish
  - [ ] Review manifest/icons/splash/theme-color/status-bar (already mostly
        configured in `vite.config.js`, recheck for gaps)
  - [ ] Optional: pull-to-refresh, offline/error fallback — only if clean

## Verification status — CLOSED (2026-06-20), QA pass added (2026-06-21)

Phase 1 + 2 are fully implemented and verified end-to-end against
`shuttley-dev` with two real test accounts. All verification gaps are
now closed — see `CHANGELOG.md`/`ISSUES.md` for full detail, and the
"Session Handover" section at the bottom of `ISSUES.md` for the
complete restart-from-cold summary.

- `SessionSummary.jsx`'s `PGRST201` issue — **resolved**. Root cause was
  an unused `profiles` embed in the query, not the underlying schema.
  Fixed by removing it; verified with multiple clean reloads including
  after a fresh `shuttley-dev` project restart.
- Vercel preview — **deliberately skipped**, not blocking. The project's
  env vars don't have a Preview-only override pointing at `shuttley-dev`,
  so pushing this branch risks a preview deployment writing test data
  into production. Revisit only if needed for phone/device testing.

A follow-up QA session (2026-06-21) spot-checked the areas left
unverified above — see `ISSUES.md` §8 for full detail:
- **Splits** — found and fixed shuttley-dev schema drift, verified
  end-to-end.
- **Chat** — found and fixed schema drift and a duplicate-conversation
  race condition, polished the app-feel, converted to one mobile-first
  layout across desktop and mobile. Verified end-to-end.
- **Account deletion / admin** — found and fixed schema drift, an RPC
  that didn't exist, a wrong table reference, and an RLS visibility gap
  in the admin dashboard. **Fixed in code, not yet verified at
  runtime** — needs `vercel dev` or a deployment, since this is the same
  "Vercel serverless functions don't execute under local `vite dev`"
  limitation already known from `/api/coach`/`/api/send-push`. Confirm
  Delete has not been clicked; no account has been anonymized.
- **Member removal/demotion** — QA'd and fixed: added last-admin
  protection (can't demote/remove a club's only remaining moderator)
  and a confirmation step on promotion for consistency with
  demote/remove. Verified end-to-end against shuttley-dev. See
  `ISSUES.md` for a flagged-but-not-applied RLS tightening suggestion
  (self-delete is currently permitted at the DB level, though unused by
  any UI feature today).
- **Rotation-mode scheduling (Auto Schedule)** — QA'd, fixed, and now
  **fully verified working** on shuttley-dev. Found a schema drift bug
  (`rotation_matches` had old pre-redesign columns), fixed the
  silent-failure handling in code, Sumit applied the flagged SQL fix,
  then re-verified end-to-end: start session, score a match, New
  Cycle, Rebalance all confirmed consistent across
  `rotation_matches`/`matches`/`match_players`. Free Play retested,
  unaffected. (Separately found and flagged, not fixed: "Add Guest" is
  also broken on shuttley-dev — missing RPC function, spun off as its
  own task.)
- **PWA install/update** — QA'd against the real production build
  (`vite preview`, since `vite dev` disables the service worker).
  Manifest, icons, SW registration/activation, install-prompt UI
  (live-tested via synthetic `beforeinstallprompt`), offline-fallback
  precaching, and the silent no-stale-version auto-update design all
  verified working. Fixed two stale references (`index.html`/
  `vite.config.js` only: a dead `logo.svg` link and a `theme-color`
  mismatch). Found and flagged, not fixed: the maskable icon has no
  safe-zone padding — needs a new image asset. **Still needs real
  device QA**: iOS Safari install, Android Chrome install banner, and
  a genuine update-while-installed scenario, none of which are
  possible in this tool.
- **Update 2026-06-23 — Vercel preview readiness: PASS.** Stood up a
  dedicated `shuttley-dev` Vercel project (separate from the real
  production Vercel project), deployed `feature/shuttley-app-feel-upgrade`
  as a Preview build wired to shuttley-dev Supabase only. Found and
  fixed an env var scoping bug along the way (Supabase vars were
  Production-only, not Preview, in the new project) — see ISSUES.md §8.
- **Update 2026-06-23 — Account-deletion Vercel runtime test: PASS.**
  `/api/deletion-requests` and `/api/delete-user` both verified working
  against shuttley-dev on the real Vercel runtime; one disposable
  `sumitdua2@gmail.com` row anonymized end-to-end, confirmed via
  runtime logs. Full detail in ISSUES.md §8.
- Still unverified: the three manual PWA device tests (iOS Safari
  install, Android Chrome install banner, update-while-installed).

**Session closed for the night (2026-06-21) at commit `13ce90f`.**
Full restart context: `SHUTTLEY — APP FEEL CLOSE OF DAY HANDOVER.md`
(repo root). **Next recommended task: manual PWA device QA** (iOS
Safari install, Android Chrome install banner, update-while-installed)
using the shuttley-dev Vercel Preview URL. Do not start V2 before then.

**Merged to `develop` 2026-06-29** via PR #2 (merge commit `73860e9`).
LAN mobile UI/flow QA passed. Deferred: HTTPS PWA install QA (requires staging deploy).

A separate **v2 architecture initiative** (groups/venues model) is
planned on its own branch (`docs/shuttley-v2-architecture-planning` →
future `feature/shuttley-v2-group-venue-architecture`), deliberately kept
independent of this branch and **not started**. See
`SHUTTLEY-V2-ARCHITECTURE.md`. Per Sumit, V2 review/implementation waits
until this app-feel branch is fully parked or merged.

## Deferred / not in this initiative

- **Court booking** — next planned feature after this upgrade and after
  current App Store re-review resolves. No schema/design work started.
- **GitHub/Vercel account split** for the dedicated Shuttley accounts — separate
  infra task, unrelated to app feel.
- **Apple rejection fixes** — camera usage string (MacBook/Xcode-only work)
  and demo account for App Store Connect — tracked separately, not blocking
  this branch since it doesn't touch `main`.

## Explicitly out of scope for this initiative

Major new features, schema migrations, Next.js migration, auth flow changes,
redesigning the whole product, anything that risks the live App Store build.
