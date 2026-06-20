# Shuttley — Changelog

## 2026-06-20 — Verify Phase 1 + 2 with a real login

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Logged in as `sumitdua84@gmail.com` against `shuttley-dev`
to verify the authenticated flows flagged as untested in the previous
entry. Found and fixed three pre-existing shuttley-dev database bugs
(unrelated to this branch's code) that were blocking testing entirely,
then verified the actual app-feel changes work end-to-end.

**Files changed:**
- New: `supabase/fix_dev_memberships_recursion.sql`,
  `supabase/fix_dev_clubs_creator_visibility.sql`
- `ISSUES.md` updated with findings

**What was found and fixed (shuttley-dev only, run by Sumit):**
1. `memberships.joined_at` column missing + four self-referencing
   `memberships` RLS policies causing infinite recursion (`42P17`)
2. `clubs` RLS blocking a creator from reading back their own
   just-created club before their membership row exists (`42501`) — a
   genuine app bug in `OnboardingPage.jsx`'s `createClub()`, not just dev
   drift. **Sumit still needs to check if production has the same gap.**

**What was verified once the dev DB was fixed:**
- Login → club creation → auto-routed to `ModeratorDashboard`
- `ModeratorDashboard`'s parallelized `Promise.all()` `fetchData()` —
  loads cleanly, no errors
- `ConfirmModal` (both the named-function and inline-arrow-function
  conversions) — Sign Out and "Request to Delete Club" both work
  correctly
- No regressions in pre-existing UI (Start Session modal) alongside the
  changes

**Still not verified** (test club has no matches/sessions/polls/other
members yet): destructive-action confirms for match/session/poll
deletion and member management, `MemberDashboard` (test account is a
moderator), skeleton appearance with real session data, route transition
feel on a real device, PWA install/update after the bundle restructure.
See [ISSUES.md](ISSUES.md) for the full list.

**Production touched:** No.

## 2026-06-20 — Phase 1 + 2: App-feel polish, code splitting, Supabase parallelization

**Branch:** `feature/shuttley-app-feel-upgrade`

**Summary:** Combined Phase 1 (app-feel) and Phase 2 (performance) work in
one pass per Sumit's direction. No new features, no schema changes, no
production deploy.

**Files changed:**
- New: `src/components/Toast.jsx`, `src/components/ConfirmModal.jsx`,
  `src/components/Skeleton.jsx`, `src/hooks/useConfirm.jsx`
- Modified: `src/index.css` (skeleton shimmer, confirm modal, route fade
  CSS), `src/App.jsx` (React.lazy + Suspense + route transition wrapper),
  `src/pages/AdminDashboard.jsx`, `MatchesPage.jsx`, `MemberDashboard.jsx`,
  `ModeratorDashboard.jsx`, `ProfilePage.jsx`, `RotationPage.jsx`,
  `SessionSummary.jsx`

**What changed:**
1. Replaced all 27 raw `alert()`/`confirm()`/`window.confirm()` calls with
   a shared `Toast` component and a promise-based `useConfirm()` hook +
   `ConfirmModal`. Business logic and call order unchanged — only the UI
   mechanism for confirmation/error messaging changed.
2. Replaced blank-splash loading on `MemberDashboard`, `ModeratorDashboard`,
   `RotationPage`, `SessionSummary` with a `DashboardSkeleton` (skeleton
   cards + list rows) instead of a full-screen blank wait.
3. Added a 180ms fade route transition wrapping `<Routes>` in `App.jsx`.
4. Converted all 18 route imports in `App.jsx` to `React.lazy()` +
   `Suspense`. Main JS bundle dropped from **692.99 KB to 394.10 KB**
   (181.14 KB to 112.89 KB gzip); Vite's "chunk larger than 500kB" build
   warning is gone. Each route now loads its own small chunk on demand.
5. Parallelized independent Supabase calls in `MemberDashboard.jsx` and
   `ModeratorDashboard.jsx` `fetchData()` — both functions previously made
   ~8 sequential `await` round-trips; now batched into 1-2
   `Promise.all()` groups (only batching calls with no data dependency on
   each other; the splits-balance fetch correctly stays sequential since
   it depends on `featuresData`).

**Testing performed:**
- `npm run build` after every change group — all passed, no errors.
- Verified in the dev server (`shuttley-dev` Supabase project, not
  production) via browser automation: login page renders, lazy-loaded
  public routes (`/privacy`, `/join/:code`) load with zero console errors,
  full page reload works cleanly post-refactor.
- **Not verified:** authenticated dashboard flows (Member/Moderator
  dashboard, match recording, chat, splits) — no test login credentials
  available in this session. See [ISSUES.md](ISSUES.md).

**Known issues:** see [ISSUES.md](ISSUES.md).

**Production touched:** No. All work on `feature/shuttley-app-feel-upgrade`,
no merge to `develop` or `main`, no deploy.

## 2026-06-20 — Phase 0: Audit Shuttley app-feel upgrade scope

**Branch:** `feature/shuttley-app-feel-upgrade` (created from `develop`)

**Summary:** Audited the current frontend for the App-Feel Upgrade
initiative. No functional code changed yet — this entry covers the audit
and documentation setup only.

**Files changed:**
- `PROJECT.md` (new) — project overview, audit findings, scope boundaries
- `ROADMAP.md` (new) — phased plan and checklist
- `CHANGELOG.md` (new, this file)
- `ISSUES.md` (new) — known issues, risky areas, deferred items

**Audit findings (see PROJECT.md for detail):**
- Single 692.99 KB JS bundle (181.14 KB gzip), no route-level code splitting
- 5 pages over 800 lines (`ModeratorDashboard`, `MemberDashboard`,
  `MatchesPage`, `SplitsPage`, `ChatPage`)
- Sequential (non-parallel) Supabase calls on dashboard load
- No skeleton loading states, only a single full-screen splash
- 20 raw `alert()`/`confirm()` calls across 5 pages
- Existing CSS token system and safe-area handling already in good shape —
  not starting from a blank UI

**Testing performed:** `npm run build` run to confirm current bundle size
and baseline build health (passed, build succeeds, warning about chunk size
as expected and documented).

**Known issues:** see [ISSUES.md](ISSUES.md).

**Production touched:** No. No commits to `main`, no deployment triggered.
