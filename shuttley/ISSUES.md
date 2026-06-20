# Shuttley — Known Issues / Risk Log

## App-Feel Upgrade initiative (`feature/shuttley-app-feel-upgrade`)

### Risky areas to watch

- **`alert`/`confirm` replacements touch destructive actions** — match
  deletion, session deletion, member removal, account anonymisation. When
  swapping these for a `ConfirmModal`, the underlying Supabase call and
  business logic must not change, only the UI. Needs careful manual
  retest of each destructive flow (delete match, delete session, remove
  member, anonymise account, sign out) before this is considered done.
- **`MemberDashboard.jsx` / `ModeratorDashboard.jsx` are large and load
  many independent pieces of state** (club, memberships, active session,
  win stats, polls, club_features, splits). Parallelizing their Supabase
  calls (Phase 2) needs care to confirm no calls are secretly dependent on
  an earlier one's result before converting to `Promise.all`.
- **`club_features` table has no default RLS read access for members**
  (see prior incident, fixed once already) — if Phase 2/3 touches any new
  feature-flag-gated UI, re-verify members can actually read the flag, not
  just that admin can write it.
- **PWA service worker uses `injectManifest` with `autoUpdate`** — any
  route-splitting change (Phase 2) changes the chunk graph the service
  worker precaches; rebuild and reinstall the PWA locally after splitting
  to confirm the install/update flow still works before this ships.

### Deferred improvements (not done in this phase)

- Route-level code splitting (Phase 2)
- Supabase call parallelization (Phase 2)
- Breaking up the 5 large page files into shared components (Phase 3)
- React Query / caching adoption — deferred until Phase 2 shows it's
  clearly worth the new dependency
- PWA manifest/splash deeper polish (Phase 4)

### Needs Sumit review

- Final visual review of any new loading skeletons / toasts / modals
  against brand before merging to `develop`.
- Confirm whether `feature/shuttley-app-feel-upgrade` should merge to
  `develop` first (as staging) or wait and go straight through a longer
  manual QA pass given the live App Store build depends on `main` staying
  untouched.

### Bugs found

_None yet — Phase 0 was audit/documentation only, no code changed._

---

## Phase 1 + 2 implementation (2026-06-20)

### Found: shuttley-dev database bugs (unrelated to this branch's code)

While testing with a real login, found the `shuttley-dev` Supabase
project itself is broken, blocking all club-related testing regardless of
this branch's changes:
- `memberships.joined_at` column doesn't exist (`42703`) — present in
  production's schema, missed during the manual table-by-table dev clone
- Infinite recursion in the `memberships` SELECT RLS policy (`42P17`) —
  the policy from `supabase/fix_all_rls.sql` self-references
  `memberships` in its own `USING` clause
- Fix written to `supabase/fix_dev_memberships_recursion.sql` — adds the
  column and replaces the self-referencing policy with a
  `SECURITY DEFINER` helper function. **Not yet run** — needs to be
  executed in the Supabase SQL editor for `shuttley-dev`
  (`ecdibuhrgdmsdvovmlvl`) only, never production.
- Confirmed via `git diff develop -- src/pages/OnboardingPage.jsx` (where
  the error surfaces) that this is pre-existing and not introduced by
  this branch.

### Needs Sumit review — IMPORTANT

**Authenticated flows were not fully tested in this session** — login
itself was verified working, but club/dashboard flows are blocked by the
shuttley-dev database bugs above until the fix script is run. The following
*must* be manually verified on `feature/shuttley-app-feel-upgrade` (e.g.
via `npm run dev`, signed in against the `shuttley-dev` Supabase project)
before this branch merges anywhere:

- Login → Member dashboard → Moderator dashboard navigation
- Every destructive action that used to be a native `confirm()`: delete
  match, delete session, end session, remove member, demote moderator,
  delete poll, anonymise account (admin), sign out, request club deletion
- Toast messages still appear/auto-dismiss correctly (visually) — logic
  was preserved but not visually inspected
- `DashboardSkeleton` appearance on `MemberDashboard`/`ModeratorDashboard`/
  `RotationPage`/`SessionSummary` while data loads — looks reasonable in
  code but not visually confirmed against real data shapes
- Route transition (180ms fade) doesn't feel laggy or cause layout jump on
  a real device
- PWA install/update flow after the `React.lazy()` change — the service
  worker's precache manifest changed shape (34 entries vs 12 before);
  reinstall the PWA locally and confirm install + auto-update still work

### Risky areas to watch (carried over + new)

- `MemberDashboard.jsx` / `ModeratorDashboard.jsx` `fetchData()` were
  restructured to batch independent Supabase calls via `Promise.all()`.
  Each call was checked for data dependencies before batching (the
  splits-balance fetch correctly stays sequential after `featuresData`),
  but this is exactly the kind of change that can hide a subtle bug if a
  dependency was missed — worth an extra careful pass against the
  dashboards with real session/poll/splits data.
- `club_features` RLS gotcha (see below, unchanged) still applies if any
  future feature-flag work touches this code.

### Deferred improvements (not done in this phase)

- Query limits/filters on large reads
- Shared data hooks (`useClubData`, `useMembers`, etc.) — Phase 3
- Breaking up the 5 large page files into shared components — Phase 3
- React Query / caching adoption
- PWA manifest/splash deeper polish — Phase 4
- Parallelizing Supabase calls in `MatchesPage.jsx` / `RotationPage.jsx` —
  not done this round, kept scope to the two dashboards named in the brief
